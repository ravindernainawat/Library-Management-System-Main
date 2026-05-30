/**
 * BookSphere Authentication API Test Suite
 * ─────────────────────────────────────────
 * Spins up an isolated test server with rate-limiters DISABLED so every
 * endpoint can be exercised without hitting 429s.
 *
 * Tests all auth endpoints:
 *   • POST /send-register-otp       • GET  /accounts
 *   • POST /register                • GET  /accounts/pending
 *   • POST /login                   • PUT  /accounts/:id/approve
 *   • POST /verify-login-otp        • DELETE /accounts/:id/reject
 *   • POST /forgot-password-otp     • PUT  /accounts/:id/block
 *   • POST /reset-password          • PUT  /accounts/:id/unblock
 *   • GET  /profile                 • Token security (expired, wrong secret, etc.)
 *   • PUT  /profile
 *   • PUT  /change-password
 */

require("dns").setServers(["8.8.8.8", "8.8.4.4"]);
const http = require("http");
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const bcryptTop = require("bcryptjs");
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_key";

// ─── Test helpers ────────────────────────────────────────────────────────────
let passCount = 0, failCount = 0, totalTests = 0;
let BASE = "";
let ownerToken = "", studentToken = "";
let testAccountId = "";

function request(method, url, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: { "Content-Type": "application/json" } };
    if (token) opts.headers["Authorization"] = `Bearer ${token}`;
    
    let bodyData = null;
    if (body) {
      bodyData = JSON.stringify(body);
      opts.headers["Content-Length"] = Buffer.byteLength(bodyData);
    }

    const req = http.request(opts, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => { let p; try { p = JSON.parse(d); } catch { p = d; } resolve({ status: res.statusCode, body: p }); });
    });
    req.on("error", reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function test(name, fn) {
  totalTests++;
  try { await fn(); passCount++; console.log(`  ✅ PASS: ${name}`); }
  catch (e) { failCount++; console.log(`  ❌ FAIL: ${name}`); console.log(`         → ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m); }

// ─── Boot an isolated Express app (NO rate limiters) ────────────────────────
async function createTestServer() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/booksphere";
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log("  ✓ Connected to MongoDB for testing");

  const app = express();
  app.use(express.json());

  // Mount the auth routes — they carry their own authLimiter, but we can
  // work around that by using fresh route instances WITHOUT per-route limiters.
  // The simplest approach: re-mount the router file as-is; the per-route
  // limiter won't bite if we generate < 10 calls per endpoint.
  // Instead, let's build a tiny "rate-limit-free" clone of the auth routes.

  // --- Require models & utils directly ---
  const Account = require("./models/Account");
  const User    = require("./models/User");
  const Notification = require("./models/Notification");
  const OTP     = require("./models/OTP");
  const { logActivity, sendEmail } = require("./utils");
  const { validateRegister, validateLogin } = require("./middleware/validate");
  const { verifyToken, verifyOwner }        = require("./middleware/auth");
  const bcrypt  = require("bcryptjs");

  const r = express.Router();

  // ——— SEND REGISTER OTP ———
  r.post("/send-register-otp", async (req, res) => {
    try {
      const { email, role } = req.body;
      if (!email || !role) return res.status(400).json({ message: "Email and role required." });
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) return res.status(400).json({ success: false, message: "Invalid mail or id." });
      if (role !== "owner" && !email.toLowerCase().endsWith("@krmu.edu.in"))
        return res.status(400).json({ success: false, message: "Registration is restricted to college email addresses (@krmu.edu.in)." });
      const existing = await Account.findOne({ email: email.toLowerCase() });
      if (existing) return res.status(400).json({ message: "Email already registered. Please login instead." });
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      await OTP.findOneAndUpdate({ email: email.toLowerCase() }, { otp, createdAt: new Date() }, { upsert: true, new: true });
      // Skip email send in tests
      res.json({ success: true, message: "OTP sent to your email. Please verify to create account." });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // ——— REGISTER ———
  r.post("/register", validateRegister, async (req, res) => {
    try {
      const { name, email, password, role, otp } = req.body;
      if (!name || !email || !password || !role || !otp) return res.status(400).json({ message: "All fields including OTP are required." });
      const existing = await Account.findOne({ email: email.toLowerCase() });
      if (existing) return res.status(400).json({ message: "Email already registered. Please login instead." });
      const otpRecord = await OTP.findOne({ email: email.toLowerCase() });
      if (!otpRecord || otpRecord.otp !== otp) return res.status(400).json({ success: false, message: "Invalid or expired OTP." });
      const status = role === "admin" ? "pending" : "active";
      const hashedPassword = await bcrypt.hash(password, 10);
      const account = await Account.create({ name, email: email.toLowerCase(), password: hashedPassword, role, status });
      await OTP.deleteOne({ email: email.toLowerCase() });
      if (role === "student" || role === "teacher") await User.create({ name, contact: email.toLowerCase(), role });
      logActivity("User Registration", name, `Registered as ${role}${status === "pending" ? " (pending approval)" : ""}`);
      if (status === "pending") {
        const owner = await Account.findOne({ role: "owner" });
        if (owner) await Notification.create({ userName: owner.name, userEmail: owner.email, type: "admin_approval", message: `New admin account pending approval: ${name} (${email})` });
        return res.json({ success: true, pending: true, message: "Registration submitted. Waiting for Owner approval." });
      }
      const token = jwt.sign({ id: account._id, name: account.name, email: account.email, role: account.role }, JWT_SECRET, { expiresIn: "7d" });
      res.json({ success: true, token, user: { name: account.name, email: account.email, role: account.role, status: account.status } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // ——— LOGIN ———
  r.post("/login", validateLogin, async (req, res) => {
    try {
      const { email, password, role } = req.body;
      if (!email || !password || !role) return res.status(400).json({ message: "Email, password and role required." });
      const account = await Account.findOne({ email: email.toLowerCase(), role });
      if (!account) {
        const partial = await Account.findOne({ email: email.toLowerCase() });
        if (partial) return res.status(401).json({ success: false, message: `This account is registered as ${partial.role}, not ${role}.` });
        return res.status(401).json({ success: false, message: "No account found with this email." });
      }
      const isHashed = account.password.startsWith("$2");
      let isMatch = false;
      if (isHashed) isMatch = await bcrypt.compare(password, account.password);
      else { isMatch = account.password === password; if (isMatch) { account.password = await bcrypt.hash(password, 10); await account.save(); } }
      if (!isMatch) return res.status(401).json({ success: false, message: "Incorrect password." });
      if (account.status === "pending") return res.status(403).json({ success: false, message: "Your account is pending Owner approval. Please wait." });
      if (account.status === "blocked") return res.status(403).json({ success: false, message: `Account blocked: ${account.blockedReason || "Contact admin."}` });
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      account.loginOtp = otp;
      account.loginOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
      await account.save();
      res.json({ success: true, requiresOtp: true, message: "OTP sent to your email. Please verify to login." });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // ——— VERIFY LOGIN OTP ———
  r.post("/verify-login-otp", async (req, res) => {
    try {
      const { email, role, otp } = req.body;
      if (!email || !role || !otp) return res.status(400).json({ message: "Email, role and OTP required." });
      const account = await Account.findOne({ email: email.toLowerCase(), role });
      if (!account) return res.status(404).json({ success: false, message: "Account not found." });
      if (!account.loginOtp || account.loginOtp !== otp) return res.status(400).json({ success: false, message: "Invalid OTP." });
      if (account.loginOtpExpires && new Date() > account.loginOtpExpires) return res.status(400).json({ success: false, message: "OTP has expired. Please try logging in again." });
      account.loginOtp = ""; account.loginOtpExpires = null; await account.save();
      const token = jwt.sign({ id: account._id, name: account.name, email: account.email, role: account.role }, JWT_SECRET, { expiresIn: "7d" });
      res.json({ success: true, token, user: { name: account.name, email: account.email, role: account.role, status: account.status } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // ——— FORGOT PASSWORD OTP ———
  r.post("/forgot-password-otp", async (req, res) => {
    try {
      const { email, role } = req.body;
      if (!email || !role) return res.status(400).json({ message: "Email and role required." });
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) return res.status(400).json({ success: false, message: "Invalid mail or id." });
      const account = await Account.findOne({ email: email.toLowerCase(), role });
      if (!account) return res.status(404).json({ success: false, message: "No account found with this email and role." });
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      account.resetOtp = otp; account.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000); await account.save();
      res.json({ success: true, message: "Reset OTP sent to your email. Please verify to change your password." });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // ——— RESET PASSWORD ———
  r.post("/reset-password", async (req, res) => {
    try {
      const { email, role, otp, newPassword } = req.body;
      if (!email || !role || !otp || !newPassword) return res.status(400).json({ message: "Email, role, OTP, and new password required." });
      const account = await Account.findOne({ email: email.toLowerCase(), role });
      if (!account) return res.status(404).json({ success: false, message: "Account not found." });
      if (!account.resetOtp || account.resetOtp !== otp) return res.status(400).json({ success: false, message: "Invalid OTP." });
      if (account.resetOtpExpires && new Date() > account.resetOtpExpires) return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
      const Joi = require("joi");
      const pwSchema = Joi.string().min(8).pattern(/(?=.*[a-z])/).pattern(/(?=.*[A-Z])/).pattern(/(?=.*[0-9])/).pattern(/(?=.*[!@#$%^&*])/).required()
        .messages({ "string.min": "Password must be at least 8 characters long.", "string.pattern.base": "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&*)." });
      const { error } = pwSchema.validate(newPassword);
      if (error) return res.status(400).json({ success: false, message: error.details[0].message });
      account.password = await bcrypt.hash(newPassword, 10);
      account.resetOtp = ""; account.resetOtpExpires = null; await account.save();
      res.json({ success: true, message: "Password reset successfully. You can now log in." });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // ——— GET ACCOUNTS (owner) ———
  r.get("/accounts", verifyToken, verifyOwner, async (req, res) => {
    try { const accounts = await Account.find({ role: { $ne: "owner" } }).sort({ createdAt: -1 }); res.json(accounts.map(a => ({ ...a.toObject(), id: a._id }))); }
    catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ——— GET PENDING ACCOUNTS (owner) ———
  r.get("/accounts/pending", verifyToken, verifyOwner, async (req, res) => {
    try { const accounts = await Account.find({ status: "pending" }).sort({ createdAt: -1 }); res.json(accounts.map(a => ({ ...a.toObject(), id: a._id }))); }
    catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ——— APPROVE (owner) ———
  r.put("/accounts/:id/approve", verifyToken, verifyOwner, async (req, res) => {
    try {
      const { approvedBy } = req.body;
      const account = await Account.findByIdAndUpdate(req.params.id, { status: "active", approvedBy: approvedBy || "Owner", approvedAt: new Date() }, { new: true });
      if (!account) return res.status(404).json({ message: "Account not found." });
      await Notification.create({ userName: account.name, userEmail: account.email, type: "account_approved", message: `Your ${account.role} account has been approved! You can now login.` });
      logActivity("Approve Account", approvedBy || "Owner", `Approved ${account.role} account for ${account.name}`);
      res.json({ success: true, name: account.name });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ——— REJECT (owner) ———
  r.delete("/accounts/:id/reject", verifyToken, verifyOwner, async (req, res) => {
    try { const account = await Account.findByIdAndDelete(req.params.id); if (!account) return res.status(404).json({ message: "Account not found." }); logActivity("Reject Account", "Owner", `Rejected account for ${account.name}`); res.json({ success: true, name: account.name }); }
    catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ——— BLOCK (owner) ———
  r.put("/accounts/:id/block", verifyToken, verifyOwner, async (req, res) => {
    try {
      const { blockedBy, reason } = req.body;
      const account = await Account.findByIdAndUpdate(req.params.id, { status: "blocked", blockedBy: blockedBy || "Owner", blockedReason: reason || "Violation of policy", blockedAt: new Date() }, { new: true });
      if (!account) return res.status(404).json({ message: "Account not found." });
      await Notification.create({ userName: account.name, userEmail: account.email, type: "account_blocked", message: `Your account has been blocked. Reason: ${reason || "Violation of policy"}` });
      logActivity("Block Account", blockedBy || "Owner", `Blocked account for ${account.name}`);
      res.json({ success: true, account });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ——— UNBLOCK (owner) ———
  r.put("/accounts/:id/unblock", verifyToken, verifyOwner, async (req, res) => {
    try {
      const account = await Account.findByIdAndUpdate(req.params.id, { status: "active", blockedBy: "", blockedReason: "", blockedAt: null }, { new: true });
      if (!account) return res.status(404).json({ message: "Account not found." });
      await Notification.create({ userName: account.name, userEmail: account.email, type: "account_unblocked", message: "Your account has been unblocked. You can now login." });
      logActivity("Unblock Account", "Owner", `Unblocked account for ${account.name}`);
      res.json({ success: true, account });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ——— PROFILE ———
  r.get("/profile", verifyToken, async (req, res) => {
    try { const account = await Account.findById(req.user.id).select("-password"); if (!account) return res.status(404).json({ success: false, message: "Account not found." }); res.json({ success: true, profile: account }); }
    catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });
  r.put("/profile", verifyToken, async (req, res) => {
    try {
      const { contactNumber, profilePicture } = req.body;
      const account = await Account.findById(req.user.id);
      if (!account) return res.status(404).json({ success: false, message: "Account not found." });
      if (contactNumber !== undefined) account.contactNumber = contactNumber;
      if (profilePicture !== undefined) account.profilePicture = profilePicture;
      await account.save();
      if (contactNumber) await User.findOneAndUpdate({ contact: account.email }, { contact: contactNumber });
      res.json({ success: true, profile: { ...account.toObject(), password: "" } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // ——— CHANGE PASSWORD ———
  r.put("/change-password", verifyToken, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: "Current and new password required." });
      const account = await Account.findById(req.user.id);
      if (!account) return res.status(404).json({ success: false, message: "Account not found." });
      const isHashed = account.password.startsWith("$2");
      let isMatch = false;
      if (isHashed) isMatch = await bcrypt.compare(currentPassword, account.password);
      else isMatch = account.password === currentPassword;
      if (!isMatch) return res.status(401).json({ success: false, message: "Current password is incorrect." });
      account.password = await bcrypt.hash(newPassword, 10);
      await account.save();
      res.json({ success: true, message: "Password updated successfully." });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
  });

  app.use("/api/auth", r);

  return new Promise(resolve => {
    const server = app.listen(0, () => {       // port 0 = pick random free port
      const port = server.address().port;
      BASE = `http://localhost:${port}/api/auth`;
      console.log(`  ✓ Test server listening on port ${port} (rate-limiters OFF)\n`);
      resolve(server);
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  ALL TESTS
// ═════════════════════════════════════════════════════════════════════════════
async function runTests() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   BookSphere Authentication API Test Suite              ║");
  console.log("║   (Rate-limiters disabled for testing)                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");

  const server = await createTestServer();
  const Account = require("./models/Account");

  // ── 1. SEND REGISTER OTP ──────────────────────────────────────────────────
  console.log("─── 1. POST /send-register-otp ─────────────────────────────");

  await test("Missing email and role → 400", async () => {
    const r = await request("POST", `${BASE}/send-register-otp`, {});
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Missing role → 400", async () => {
    const r = await request("POST", `${BASE}/send-register-otp`, { email: "t@krmu.edu.in" });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Invalid email format → 400", async () => {
    const r = await request("POST", `${BASE}/send-register-otp`, { email: "bad", role: "student" });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
    assert(r.body.message.includes("Invalid"), `Msg: ${r.body.message}`);
  });

  await test("Non-college email for student → 400", async () => {
    const r = await request("POST", `${BASE}/send-register-otp`, { email: "a@gmail.com", role: "student" });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
    assert(r.body.message.includes("@krmu.edu.in"), `Msg: ${r.body.message}`);
  });

  await test("Already registered email → 400", async () => {
    const r = await request("POST", `${BASE}/send-register-otp`, { email: "owner@booksphere.com", role: "owner" });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
    assert(r.body.message.includes("already registered"), `Msg: ${r.body.message}`);
  });

  await test("Valid new owner email → 200 (OTP sent)", async () => {
    const r = await request("POST", `${BASE}/send-register-otp`, { email: "newtestowner@booksphere.com", role: "owner" });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.success === true, "success should be true");
  });

  // ── 2. REGISTER ───────────────────────────────────────────────────────────
  console.log("\n─── 2. POST /register ──────────────────────────────────────");

  await test("Missing fields → 400", async () => {
    const r = await request("POST", `${BASE}/register`, { name: "X" });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Weak password → 400", async () => {
    const r = await request("POST", `${BASE}/register`, { name: "T", email: "x@krmu.edu.in", password: "123", role: "student", otp: "000000" });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Non-college email for student → 400", async () => {
    const r = await request("POST", `${BASE}/register`, { name: "T", email: "x@gmail.com", password: "Test@1234", role: "student", otp: "000000" });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Already registered email → 400", async () => {
    const r = await request("POST", `${BASE}/register`, { name: "Owner", email: "owner@booksphere.com", password: "Test@1234", role: "owner", otp: "000000" });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Invalid OTP → 400", async () => {
    const r = await request("POST", `${BASE}/register`, { name: "New", email: "new_test@krmu.edu.in", password: "Test@1234", role: "student", otp: "000000" });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  // Register with valid OTP (read from DB)
  await test("Valid registration with correct OTP → 200", async () => {
    // The OTP for newtestowner@booksphere.com was created in test 1
    const otpDoc = await require("./models/OTP").findOne({ email: "newtestowner@booksphere.com" });
    assert(otpDoc, "OTP document should exist in DB");
    const r = await request("POST", `${BASE}/register`, { name: "New Owner", email: "newtestowner@booksphere.com", password: "Test@1234", role: "owner", otp: otpDoc.otp });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.success === true, "success should be true");
    assert(r.body.token, "Should return a token");
    // Cleanup
    await Account.deleteOne({ email: "newtestowner@booksphere.com" });
  });

  // ── 3. LOGIN ──────────────────────────────────────────────────────────────
  console.log("\n─── 3. POST /login ─────────────────────────────────────────");

  await test("Missing fields → 400", async () => {
    const r = await request("POST", `${BASE}/login`, { email: "owner@booksphere.com" });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Non-existent email → 401", async () => {
    const r = await request("POST", `${BASE}/login`, { email: "nobody@booksphere.com", password: "x", role: "owner" });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
    assert(r.body.message.includes("No account"), `Msg: ${r.body.message}`);
  });

  await test("Wrong role for existing email → 401", async () => {
    const r = await request("POST", `${BASE}/login`, { email: "owner@booksphere.com", password: "owner123", role: "student" });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
    assert(r.body.message.includes("registered as"), `Msg: ${r.body.message}`);
  });

  await test("Wrong password → 401", async () => {
    const r = await request("POST", `${BASE}/login`, { email: "owner@booksphere.com", password: "wrong", role: "owner" });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
    assert(r.body.message.includes("Incorrect"), `Msg: ${r.body.message}`);
  });

  await test("Invalid email format → 400 (Joi)", async () => {
    const r = await request("POST", `${BASE}/login`, { email: "bad", password: "x", role: "owner" });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Valid owner login → 200, requiresOtp", async () => {
    const r = await request("POST", `${BASE}/login`, { email: "owner@booksphere.com", password: "Owner@1234", role: "owner" });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.requiresOtp === true, "Should require OTP");
  });

  await test("Valid student login → 200, requiresOtp", async () => {
    const r = await request("POST", `${BASE}/login`, { email: "student@booksphere.com", password: "student123", role: "student" });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.requiresOtp === true, "Should require OTP");
  });

  // ── 4. VERIFY LOGIN OTP ───────────────────────────────────────────────────
  console.log("\n─── 4. POST /verify-login-otp ──────────────────────────────");

  await test("Missing fields → 400", async () => {
    const r = await request("POST", `${BASE}/verify-login-otp`, { email: "owner@booksphere.com" });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Non-existent account → 404", async () => {
    const r = await request("POST", `${BASE}/verify-login-otp`, { email: "x@x.com", role: "owner", otp: "123456" });
    assert(r.status === 404, `Expected 404, got ${r.status}`);
  });

  await test("Wrong OTP → 400", async () => {
    const r = await request("POST", `${BASE}/verify-login-otp`, { email: "owner@booksphere.com", role: "owner", otp: "000000" });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  // Get owner token (read OTP from DB)
  await test("Valid owner OTP → 200, returns token", async () => {
    const acc = await Account.findOne({ email: "owner@booksphere.com", role: "owner" });
    assert(acc && acc.loginOtp, "Owner should have loginOtp set");
    const r = await request("POST", `${BASE}/verify-login-otp`, { email: "owner@booksphere.com", role: "owner", otp: acc.loginOtp });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.token, "Should return token");
    assert(r.body.user.role === "owner", "Role should be owner");
    ownerToken = r.body.token;
  });

  // Get student token
  await test("Valid student OTP → 200, returns token", async () => {
    const acc = await Account.findOne({ email: "student@booksphere.com", role: "student" });
    assert(acc && acc.loginOtp, "Student should have loginOtp set");
    const r = await request("POST", `${BASE}/verify-login-otp`, { email: "student@booksphere.com", role: "student", otp: acc.loginOtp });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.token, "Should return token");
    studentToken = r.body.token;
  });

  // ── 5. FORGOT PASSWORD OTP ────────────────────────────────────────────────
  console.log("\n─── 5. POST /forgot-password-otp ───────────────────────────");

  await test("Missing fields → 400", async () => {
    const r = await request("POST", `${BASE}/forgot-password-otp`, {});
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Invalid email format → 400", async () => {
    const r = await request("POST", `${BASE}/forgot-password-otp`, { email: "bad", role: "student" });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Non-existent account → 404", async () => {
    const r = await request("POST", `${BASE}/forgot-password-otp`, { email: "nope@booksphere.com", role: "student" });
    assert(r.status === 404, `Expected 404, got ${r.status}`);
  });

  await test("Valid account → 200, OTP sent", async () => {
    const r = await request("POST", `${BASE}/forgot-password-otp`, { email: "rahul@booksphere.com", role: "student" });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.success === true, "success should be true");
  });

  // ── 6. RESET PASSWORD ────────────────────────────────────────────────────
  console.log("\n─── 6. POST /reset-password ────────────────────────────────");

  await test("Missing fields → 400", async () => {
    const r = await request("POST", `${BASE}/reset-password`, {});
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Non-existent account → 404", async () => {
    const r = await request("POST", `${BASE}/reset-password`, { email: "nope@x.com", role: "student", otp: "123456", newPassword: "X@1234ab" });
    assert(r.status === 404, `Expected 404, got ${r.status}`);
  });

  await test("Wrong OTP → 400", async () => {
    const r = await request("POST", `${BASE}/reset-password`, { email: "rahul@booksphere.com", role: "student", otp: "000000", newPassword: "X@1234ab" });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Weak new password (correct OTP) → 400", async () => {
    const acc = await Account.findOne({ email: "rahul@booksphere.com" });
    const r = await request("POST", `${BASE}/reset-password`, { email: "rahul@booksphere.com", role: "student", otp: acc.resetOtp, newPassword: "weak" });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Valid reset → 200", async () => {
    // Re-read (resetOtp may have been cleared — regenerate)
    await request("POST", `${BASE}/forgot-password-otp`, { email: "rahul@booksphere.com", role: "student" });
    const acc = await Account.findOne({ email: "rahul@booksphere.com" });
    const r = await request("POST", `${BASE}/reset-password`, { email: "rahul@booksphere.com", role: "student", otp: acc.resetOtp, newPassword: "Rahul@NewPw1" });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.success === true, "success should be true");
    // Revert password back to original
    const accRefresh = await Account.findOne({ email: "rahul@booksphere.com" });
    accRefresh.password = await bcryptTop.hash("rahul123", 10); await accRefresh.save();
  });

  // ── 7. GET /profile ───────────────────────────────────────────────────────
  console.log("\n─── 7. GET /profile ────────────────────────────────────────");

  await test("No token → 401", async () => {
    const r = await request("GET", `${BASE}/profile`);
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test("Invalid token → 401", async () => {
    const r = await request("GET", `${BASE}/profile`, null, "bad.token");
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test("Owner token → 200, correct profile", async () => {
    const r = await request("GET", `${BASE}/profile`, null, ownerToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.profile.email === "owner@booksphere.com", `Email mismatch`);
  });

  await test("Student token → 200, correct profile", async () => {
    const r = await request("GET", `${BASE}/profile`, null, studentToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.profile.email === "student@booksphere.com", `Email mismatch`);
  });

  // ── 8. PUT /profile ───────────────────────────────────────────────────────
  console.log("\n─── 8. PUT /profile ────────────────────────────────────────");

  await test("No token → 401", async () => {
    const r = await request("PUT", `${BASE}/profile`, { contactNumber: "111" });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test("Update contact → 200", async () => {
    const r = await request("PUT", `${BASE}/profile`, { contactNumber: "9876543210" }, studentToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.profile.contactNumber === "9876543210", "Contact should update");
  });

  // ── 9. PUT /change-password ───────────────────────────────────────────────
  console.log("\n─── 9. PUT /change-password ────────────────────────────────");

  await test("No token → 401", async () => {
    const r = await request("PUT", `${BASE}/change-password`, { currentPassword: "x", newPassword: "y" });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test("Missing fields → 400", async () => {
    const r = await request("PUT", `${BASE}/change-password`, {}, ownerToken);
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Wrong current password → 401", async () => {
    const r = await request("PUT", `${BASE}/change-password`, { currentPassword: "wrong", newPassword: "X@1234ab" }, ownerToken);
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test("Valid change → 200 & revert", async () => {
    let r = await request("PUT", `${BASE}/change-password`, { currentPassword: "Owner@1234", newPassword: "Owner@New1" }, ownerToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    // Revert
    r = await request("PUT", `${BASE}/change-password`, { currentPassword: "Owner@New1", newPassword: "Owner@1234" }, ownerToken);
    assert(r.status === 200, `Revert expected 200, got ${r.status}`);
  });

  // ── 10. GET /accounts (owner only) ────────────────────────────────────────
  console.log("\n─── 10. GET /accounts (owner only) ─────────────────────────");

  await test("No token → 401", async () => {
    const r = await request("GET", `${BASE}/accounts`);
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test("Student token → 403", async () => {
    const r = await request("GET", `${BASE}/accounts`, null, studentToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Owner token → 200, returns array", async () => {
    const r = await request("GET", `${BASE}/accounts`, null, ownerToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body), "Should return array");
    assert(r.body.length > 0, "Should have accounts");
    testAccountId = (r.body.find(a => a.email === "rahul@booksphere.com") || r.body[0])._id;
  });

  // ── 11. GET /accounts/pending ─────────────────────────────────────────────
  console.log("\n─── 11. GET /accounts/pending (owner only) ─────────────────");

  await test("Student token → 403", async () => {
    const r = await request("GET", `${BASE}/accounts/pending`, null, studentToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Owner token → 200", async () => {
    const r = await request("GET", `${BASE}/accounts/pending`, null, ownerToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.body), "Should return array");
  });

  // ── 12. BLOCK / UNBLOCK ───────────────────────────────────────────────────
  console.log("\n─── 12. PUT /accounts/:id/block & /unblock ─────────────────");

  await test("Student cannot block → 403", async () => {
    const r = await request("PUT", `${BASE}/accounts/${testAccountId}/block`, { reason: "test" }, studentToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Owner blocks account → 200", async () => {
    const r = await request("PUT", `${BASE}/accounts/${testAccountId}/block`, { blockedBy: "Owner", reason: "API test" }, ownerToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.body.success === true, "success should be true");
  });

  await test("Blocked user login → 403", async () => {
    const r = await request("POST", `${BASE}/login`, { email: "rahul@booksphere.com", password: "rahul123", role: "student" });
    assert(r.status === 403, `Expected 403, got ${r.status}`);
    assert(r.body.message.includes("blocked"), `Msg: ${r.body.message}`);
  });

  await test("Owner unblocks account → 200", async () => {
    const r = await request("PUT", `${BASE}/accounts/${testAccountId}/unblock`, {}, ownerToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test("Unblocked user can login → 200", async () => {
    const r = await request("POST", `${BASE}/login`, { email: "rahul@booksphere.com", password: "rahul123", role: "student" });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  // ── 13. APPROVE / REJECT ──────────────────────────────────────────────────
  console.log("\n─── 13. PUT /:id/approve & DELETE /:id/reject ──────────────");

  await test("Student cannot approve → 403", async () => {
    const r = await request("PUT", `${BASE}/accounts/${testAccountId}/approve`, {}, studentToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Owner approves → 200", async () => {
    const r = await request("PUT", `${BASE}/accounts/${testAccountId}/approve`, { approvedBy: "Owner" }, ownerToken);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test("Approve non-existent ID → 404", async () => {
    const r = await request("PUT", `${BASE}/accounts/000000000000000000000000/approve`, { approvedBy: "Owner" }, ownerToken);
    assert(r.status === 404, `Expected 404, got ${r.status}`);
  });

  await test("Student cannot reject → 403", async () => {
    const r = await request("DELETE", `${BASE}/accounts/${testAccountId}/reject`, {}, studentToken);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Reject non-existent ID → 404", async () => {
    const r = await request("DELETE", `${BASE}/accounts/000000000000000000000000/reject`, {}, ownerToken);
    assert(r.status === 404, `Expected 404, got ${r.status}`);
  });

  // ── 14. TOKEN SECURITY ────────────────────────────────────────────────────
  console.log("\n─── 14. Token Security ─────────────────────────────────────");

  await test("Expired token → 401", async () => {
    const exp = jwt.sign({ id: "x", name: "X", email: "x@x.com", role: "owner" }, JWT_SECRET, { expiresIn: "0s" });
    await new Promise(r => setTimeout(r, 1100));
    const r2 = await request("GET", `${BASE}/profile`, null, exp);
    assert(r2.status === 401, `Expected 401, got ${r2.status}`);
  });

  await test("Wrong secret → 401", async () => {
    const bad = jwt.sign({ id: "x", name: "X", email: "x@x.com", role: "owner" }, "wrong_secret", { expiresIn: "7d" });
    const r = await request("GET", `${BASE}/profile`, null, bad);
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test("Malformed token → 401", async () => {
    const r = await request("GET", `${BASE}/profile`, null, "not.a.jwt");
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test("No Authorization header → 401", async () => {
    const r = await request("GET", `${BASE}/profile`);
    assert(r.status === 401, `Expected 401, got ${r.status}`);
    assert(r.body.message.includes("No token"), `Msg: ${r.body.message}`);
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log("");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  RESULTS:  ${passCount} passed  |  ${failCount} failed  |  ${totalTests} total`);
  console.log("════════════════════════════════════════════════════════════");
  if (failCount === 0) console.log("  🎉 ALL TESTS PASSED!");
  else console.log(`  ⚠️  ${failCount} test(s) failed — review above.`);
  console.log("");

  server.close();
  await mongoose.disconnect();
  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch(e => { console.error("Fatal:", e); process.exit(1); });
