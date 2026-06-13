const express = require("express");
const router = express.Router();
const Account = require("../models/Account");
const User = require("../models/User");
const Notification = require("../models/Notification");
const OTP = require("../models/OTP");
const { logActivity, sendEmail } = require("../utils");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error("FATAL: JWT_SECRET is not set in environment variables. Server cannot start securely."); process.exit(1); }
const { validateRegister, validateLogin } = require("../middleware/validate");
const { verifyToken, verifyOwner } = require("../middleware/auth");
const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per `window` (here, per 15 minutes)
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts, please try again after 15 minutes." }
});

// SEND REGISTER OTP
router.post("/send-register-otp", authLimiter, async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || !role) return res.status(400).json({ message: "Email and role required." });

    // Owner is a unique seeded account — registration via this endpoint is forbidden
    if (role === "owner") {
      return res.status(403).json({ success: false, message: "Owner account cannot be created via registration. Contact system admin." });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid mail or id." });
    }
    
    if (!email.toLowerCase().endsWith('@krmu.edu.in')) {
      return res.status(400).json({ success: false, message: "Registration is restricted to college email addresses (@krmu.edu.in)." });
    }

    const existing = await Account.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ message: "Email already registered. Please login instead." });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    await OTP.findOneAndUpdate(
      { email: email.toLowerCase() },
      { otp, createdAt: new Date() },
      { upsert: true, new: true }
    );

    const emailSent = await sendEmail(
      email.toLowerCase(), 
      "BookSphere Registration Verification", 
      `<h3>Registration Verification</h3><p>Your OTP for creating a BookSphere account is: <b style="font-size:1.2rem;letter-spacing:2px;">${otp}</b></p><p>This OTP will expire in 10 minutes.</p>`
    );
    
    const isDev = process.env.NODE_ENV !== "production";
    if (!emailSent) {
      console.log(`\n  [DEV] Failed to send email to ${email}. Register OTP: ${otp}\n`);
    }

    res.json({
      success: true,
      message: emailSent
        ? "OTP sent to your email. Please verify to create account."
        : "OTP generated (email delivery failed — check server console for OTP).",
      ...(isDev && !emailSent ? { devOtp: otp } : {})
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// REGISTER
router.post("/register", validateRegister, async (req, res) => {
  try {
    const { name, email, password, role, otp } = req.body;
    if (!name || !email || !password || !role || !otp) return res.status(400).json({ message: "All fields including OTP are required." });

    // Owner is a unique seeded account — registration via this endpoint is forbidden
    if (role === "owner") {
      return res.status(403).json({ success: false, message: "Owner account cannot be created via registration. Contact system admin." });
    }
    
    const existing = await Account.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ message: "Email already registered. Please login instead." });
    
    // Verify OTP
    const otpRecord = await OTP.findOne({ email: email.toLowerCase() });
    if (!otpRecord || otpRecord.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP." });
    }
    
    // Admin accounts need owner approval
    const status = role === "admin" ? "pending" : "active";
    const bcrypt = require("bcryptjs");
    const hashedPassword = await bcrypt.hash(password, 10);
    const account = await Account.create({ name, email: email.toLowerCase(), password: hashedPassword, role, status });
    
    // Clear OTP after successful registration
    await OTP.deleteOne({ email: email.toLowerCase() });
    
    if (role === "student" || role === "teacher") {
      await User.create({ name, contact: email.toLowerCase(), role: role });
    }
    logActivity("User Registration", name, `Registered as ${role}${status === "pending" ? " (pending approval)" : ""}`);
    if (status === "pending") {
      // Notify owner
      const owner = await Account.findOne({ role: "owner" });
      if (owner) {
        await Notification.create({ userName: owner.name, userEmail: owner.email, type: "admin_approval", message: `New admin account pending approval: ${name} (${email})` });
      }
      return res.json({ success: true, pending: true, message: "Registration submitted. Waiting for Owner approval." });
    }
    const token = jwt.sign({ id: account._id, name: account.name, email: account.email, role: account.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { name: account.name, email: account.email, role: account.role, status: account.status } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// LOGIN
router.post("/login", authLimiter, validateLogin, async (req, res) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password || !role) return res.status(400).json({ message: "Email, password and role required." });
    const account = await Account.findOne({ email: email.toLowerCase(), role });
    if (!account) {
      const partial = await Account.findOne({ email: email.toLowerCase() });
      if (partial) return res.status(401).json({ success: false, message: `This account is registered as ${partial.role}, not ${role}.` });
      return res.status(401).json({ success: false, message: "No account found with this email." });
    }
    
    const bcrypt = require("bcryptjs");
    const isHashed = account.password.startsWith("$2"); // Check if password is already hashed

    let isMatch = false;
    if (isHashed) {
      isMatch = await bcrypt.compare(password, account.password);
    } else {
      // Legacy plain text check
      isMatch = (account.password === password);
      // Auto-upgrade plain text password to secure bcrypt hash seamlessly
      if (isMatch) {
        account.password = await bcrypt.hash(password, 10);
        await account.save();
      }
    }

    if (!isMatch) return res.status(401).json({ success: false, message: "Incorrect password." });
    if (account.status === "pending") return res.status(403).json({ success: false, message: "Your account is pending Owner approval. Please wait." });
    if (account.status === "blocked") return res.status(403).json({ success: false, message: `Account blocked: ${account.blockedReason || "Contact admin."}` });
    
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    
    account.loginOtp = otp;
    account.loginOtpExpires = expires;
    await account.save();

    const emailSent = await sendEmail(
      account.email, 
      "BookSphere Login Verification", 
      `<h3>Login Verification</h3><p>Your OTP for login is: <b style="font-size:1.2rem;letter-spacing:2px;">${otp}</b></p><p>This OTP will expire in 10 minutes.</p>`
    );
    
    const isDev = process.env.NODE_ENV !== "production";
    if (!emailSent) {
      console.log(`\n  [DEV] Failed to send email to ${account.email}. Login OTP: ${otp}\n`);
    }

    res.json({
      success: true,
      requiresOtp: true,
      message: emailSent
        ? "OTP sent to your email. Please verify to login."
        : "OTP generated (email delivery failed — check server console for OTP).",
      ...(isDev && !emailSent ? { devOtp: otp } : {})
    });
  } catch (err) { if (!res.headersSent) res.status(500).json({ success: false, message: err.message }); }
});

// VERIFY LOGIN OTP
router.post("/verify-login-otp", authLimiter, async (req, res) => {
  try {
    const { email, role, otp } = req.body;
    if (!email || !role || !otp) return res.status(400).json({ message: "Email, role and OTP required." });
    
    const account = await Account.findOne({ email: email.toLowerCase(), role });
    if (!account) return res.status(404).json({ success: false, message: "Account not found." });
    
    if (!account.loginOtp || account.loginOtp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP." });
    }
    
    if (account.loginOtpExpires && new Date() > account.loginOtpExpires) {
      return res.status(400).json({ success: false, message: "OTP has expired. Please try logging in again." });
    }
    
    // Clear OTP
    account.loginOtp = "";
    account.loginOtpExpires = null;
    await account.save();
    
    const token = jwt.sign({ id: account._id, name: account.name, email: account.email, role: account.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { name: account.name, email: account.email, role: account.role, status: account.status } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// FORGOT PASSWORD OTP
router.post("/forgot-password-otp", authLimiter, async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || !role) return res.status(400).json({ message: "Email and role required." });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Invalid mail or id." });
    }

    const account = await Account.findOne({ email: email.toLowerCase(), role });
    if (!account) return res.status(404).json({ success: false, message: "No account found with this email and role." });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    account.resetOtp = otp;
    account.resetOtpExpires = expires;
    await account.save();

    const emailSent = await sendEmail(
      account.email,
      "BookSphere Password Reset",
      `<h3>Password Reset Verification</h3><p>Your OTP to reset your password is: <b style="font-size:1.2rem;letter-spacing:2px;">${otp}</b></p><p>This OTP will expire in 10 minutes.</p>`
    );

    const isDev = process.env.NODE_ENV !== "production";
    if (!emailSent) {
      console.log(`\n  [DEV] Failed to send email to ${account.email}. Reset OTP: ${otp}\n`);
    }

    res.json({
      success: true,
      message: emailSent
        ? "Reset OTP sent to your email. Please verify to change your password."
        : "OTP generated (email delivery failed — check server console for OTP).",
      ...(isDev && !emailSent ? { devOtp: otp } : {})
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// RESET PASSWORD
router.post("/reset-password", authLimiter, async (req, res) => {
  try {
    const { email, role, otp, newPassword } = req.body;
    if (!email || !role || !otp || !newPassword) return res.status(400).json({ message: "Email, role, OTP, and new password required." });

    const account = await Account.findOne({ email: email.toLowerCase(), role });
    if (!account) return res.status(404).json({ success: false, message: "Account not found." });

    if (!account.resetOtp || account.resetOtp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP." });
    }

    if (account.resetOtpExpires && new Date() > account.resetOtpExpires) {
      return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
    }

    const Joi = require('joi');
    const passwordComplexity = Joi.string()
      .min(8)
      .pattern(new RegExp('(?=.*[a-z])'))
      .pattern(new RegExp('(?=.*[A-Z])'))
      .pattern(new RegExp('(?=.*[0-9])'))
      .pattern(new RegExp('(?=.*[!@#$%^&*])'))
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters long.',
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&*).'
      });

    const { error } = passwordComplexity.validate(newPassword);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const bcrypt = require("bcryptjs");
    account.password = await bcrypt.hash(newPassword, 10);
    account.resetOtp = "";
    account.resetOtpExpires = null;
    await account.save();

    res.json({ success: true, message: "Password reset successfully. You can now log in." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET all accounts (owner only)
router.get("/accounts", verifyToken, verifyOwner, async (req, res) => {
  try {
    const accounts = await Account.find({ role: { $ne: "owner" } }).sort({ createdAt: -1 });
    res.json(accounts.map(a => ({ ...a.toObject(), id: a._id })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET pending accounts (owner only)
router.get("/accounts/pending", verifyToken, verifyOwner, async (req, res) => {
  try {
    const accounts = await Account.find({ status: "pending" }).sort({ createdAt: -1 });
    res.json(accounts.map(a => ({ ...a.toObject(), id: a._id })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// APPROVE account (owner only)
router.put("/accounts/:id/approve", verifyToken, verifyOwner, async (req, res) => {
  try {
    const { approvedBy } = req.body;
    const account = await Account.findByIdAndUpdate(req.params.id, { status: "active", approvedBy: approvedBy || "Owner", approvedAt: new Date() }, { new: true });
    if (!account) return res.status(404).json({ message: "Account not found." });
    await Notification.create({ userName: account.name, userEmail: account.email, type: "account_approved", message: `Your ${account.role} account has been approved! You can now login.` });
    logActivity("Approve Account", approvedBy || "Owner", `Approved ${account.role} account for ${account.name}`);
    res.json({ success: true, name: account.name });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// REJECT/DELETE pending account
router.delete("/accounts/:id/reject", verifyToken, verifyOwner, async (req, res) => {
  try {
    const account = await Account.findByIdAndDelete(req.params.id);
    if (!account) return res.status(404).json({ message: "Account not found." });
    logActivity("Reject Account", "Owner", `Rejected account for ${account.name}`);
    res.json({ success: true, name: account.name });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// BLOCK / UNBLOCK account (owner only)
router.put("/accounts/:id/block", verifyToken, verifyOwner, async (req, res) => {
  try {
    const { blockedBy, reason } = req.body;
    const account = await Account.findByIdAndUpdate(req.params.id, { status: "blocked", blockedBy: blockedBy || "Owner", blockedReason: reason || "Violation of policy", blockedAt: new Date() }, { new: true });
    if (!account) return res.status(404).json({ message: "Account not found." });
    await Notification.create({ userName: account.name, userEmail: account.email, type: "account_blocked", message: `Your account has been blocked. Reason: ${reason || "Violation of policy"}` });
    logActivity("Block Account", blockedBy || "Owner", `Blocked account for ${account.name}`);
    res.json({ success: true, account });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put("/accounts/:id/unblock", verifyToken, verifyOwner, async (req, res) => {
  try {
    const account = await Account.findByIdAndUpdate(req.params.id, { status: "active", blockedBy: "", blockedReason: "", blockedAt: null }, { new: true });
    if (!account) return res.status(404).json({ message: "Account not found." });
    await Notification.create({ userName: account.name, userEmail: account.email, type: "account_unblocked", message: `Your account has been unblocked. You can now login.` });
    logActivity("Unblock Account", "Owner", `Unblocked account for ${account.name}`);
    res.json({ success: true, account });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PROFILE ROUTES

// GET current user profile
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const account = await Account.findById(req.user.id).select("-password");
    if (!account) return res.status(404).json({ success: false, message: "Account not found." });
    res.json({ success: true, profile: account });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// UPDATE profile details
router.put("/profile", verifyToken, async (req, res) => {
  try {
    const { contactNumber, profilePicture } = req.body;
    const account = await Account.findById(req.user.id);
    if (!account) return res.status(404).json({ success: false, message: "Account not found." });
    
    if (contactNumber !== undefined) account.contactNumber = contactNumber;
    if (profilePicture !== undefined) account.profilePicture = profilePicture;
    await account.save();

    // NOTE: We intentionally do NOT update User.contact here.
    // User.contact stores the account email and is used as the primary key
    // to join User ↔ Account records. Overwriting it with a phone number
    // would break the admin panel's user lookup and status display.
    
    res.json({ success: true, profile: { ...account.toObject(), password: "" } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// CHANGE PASSWORD
router.put("/change-password", verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: "Current and new password required." });
    
    const account = await Account.findById(req.user.id);
    if (!account) return res.status(404).json({ success: false, message: "Account not found." });
    
    const bcrypt = require("bcryptjs");
    const isHashed = account.password.startsWith("$2");
    let isMatch = false;
    
    if (isHashed) {
      isMatch = await bcrypt.compare(currentPassword, account.password);
    } else {
      isMatch = (account.password === currentPassword);
    }
    
    if (!isMatch) return res.status(401).json({ success: false, message: "Current password is incorrect." });
    
    account.password = await bcrypt.hash(newPassword, 10);
    await account.save();
    res.json({ success: true, message: "Password updated successfully." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
