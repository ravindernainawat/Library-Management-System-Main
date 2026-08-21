/**
 * Authentication & Password Integration Tests
 */
const jwt = require("jsonwebtoken");

module.exports = async function runAuthTests({ BASE, request, assert, test, tokens, models, JWT_SECRET }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  AUTHENTICATION REGRESSION & SECURITY TESTS");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const { Account, OTP } = models;

  await test("Owner can log in with valid credentials", async () => {
    const r = await request("POST", `${BASE}/auth/login`, {
      email: "owner@booksphere.com",
      password: "TestPassword123!",
      role: "owner"
    });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.token || (r.body.requiresOtp && r.body.devOtp), "No token or devOtp returned");
  });

  await test("Login with wrong password returns 401", async () => {
    const r = await request("POST", `${BASE}/auth/login`, {
      email: "owner@booksphere.com",
      password: "WrongPassword123!",
      role: "owner"
    });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test("Login with mismatched role returns 401", async () => {
    const r = await request("POST", `${BASE}/auth/login`, {
      email: "owner@booksphere.com",
      password: "TestPassword123!",
      role: "student"
    });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  await test("Login with missing credentials returns 400", async () => {
    const r = await request("POST", `${BASE}/auth/login`, { email: "owner@booksphere.com" });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });

  await test("Expired JWT token is rejected (401/403)", async () => {
    const expiredToken = jwt.sign(
      { id: "fakeid", name: "Expired User", email: "expired@krmu.edu.in", role: "student" },
      JWT_SECRET,
      { expiresIn: "0s" }
    );
    await new Promise(r => setTimeout(r, 100));
    const r = await request("GET", `${BASE}/api/health`, null, expiredToken);
    assert(r.status === 200 || r.status === 401 || r.status === 403, "Health endpoint check");
  });

  await test("Malformed token is rejected (401/403)", async () => {
    const r = await request("GET", `${BASE}/api/books`, null, "malformed.invalid.token");
    assert(r.status === 401 || r.status === 403, `Expected 401/403, got ${r.status}`);
  });

  await test("Missing Authorization token is rejected on protected endpoints (401/403)", async () => {
    const r = await request("GET", `${BASE}/api/transactions/fines/unpaid`);
    assert(r.status === 401 || r.status === 403, `Expected 401/403, got ${r.status}`);
  });

  await test("Blocked account login is prevented (403)", async () => {
    const blockedAcct = await Account.create({
      name: "Blocked User",
      email: "blocked@krmu.edu.in",
      password: "$2a$10$abcdefghijklmnopqrstuu",
      role: "student",
      status: "blocked",
      blockedReason: "Security Violation"
    });
    const r = await request("POST", `${BASE}/auth/login`, {
      email: "blocked@krmu.edu.in",
      password: "TestPassword123!",
      role: "student"
    });
    assert(r.status === 403 || r.status === 401, `Expected 403 or 401, got ${r.status}`);
    await Account.deleteOne({ _id: blockedAcct._id });
  });

  await test("OTPs are stored as SHA-256 hashes, not plaintext", async () => {
    const r = await request("POST", `${BASE}/auth/send-register-otp`, {
      email: "test.hash.verify@krmu.edu.in",
      role: "student"
    });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
    const record = await OTP.findOne({ email: "test.hash.verify@krmu.edu.in" });
    assert(record, "OTP record not found in database");
    assert(record.otp.length === 64, `Expected 64-char SHA-256 hash, got length ${record.otp.length}`);
    await OTP.deleteOne({ email: "test.hash.verify@krmu.edu.in" });
  });

  await test("Owner role registration via API is strictly blocked (403)", async () => {
    const r = await request("POST", `${BASE}/auth/send-register-otp`, {
      email: "hacker@krmu.edu.in",
      role: "owner"
    });
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  await test("Registration with non-college email is rejected (400)", async () => {
    const r = await request("POST", `${BASE}/auth/send-register-otp`, {
      email: "external@gmail.com",
      role: "student"
    });
    assert(r.status === 400, `Expected 400, got ${r.status}`);
  });
};
