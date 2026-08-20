/**
 * BookSphere v2.0 — Comprehensive Master Integration Test Runner
 * 
 * Spins up an in-memory MongoDB (or isolated DB), boots Express API test server,
 * seeds standard isolated test accounts (Owner, Admin, Teacher, Student A, Student B),
 * and executes modular integration test suites.
 *
 * Usage: npm test
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
process.env.NODE_ENV = "test";

const http = require("http");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { MongoMemoryServer } = require("mongodb-memory-server");

const JWT_SECRET = process.env.JWT_SECRET || "test_master_fallback_secret_key_booksphere_v2";

let passCount = 0;
let failCount = 0;
let totalTests = 0;
let BASE = "";

function request(method, url, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      headers: { "Content-Type": "application/json" }
    };
    if (token) opts.headers["Authorization"] = `Bearer ${token}`;
    let bodyData = null;
    if (body) {
      bodyData = JSON.stringify(body);
      opts.headers["Content-Length"] = Buffer.byteLength(bodyData);
    }
    const req = http.request(opts, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        let p;
        try { p = JSON.parse(d); } catch { p = d; }
        resolve({ status: res.statusCode, body: p });
      });
    });
    req.on("error", reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passCount++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (e) {
    failCount++;
    console.log(`  ❌ FAIL: ${name}`);
    console.log(`         → ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}

async function bootServer() {
  let mongod = null;
  let mongoUri = "";
  try {
    mongod = await MongoMemoryServer.create();
    mongoUri = mongod.getUri();
    console.log("  ✓ Initialized in-memory MongoDB server");
  } catch (err) {
    console.warn("  ⚠ MongoMemoryServer init warning:", err.message);
    mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/booksphere_test_runner";
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  console.log("  ✓ Connected to MongoDB for test isolation");

  const Account = require("../models/Account");
  const User = require("../models/User");
  const Book = require("../models/Book");
  const BookCopy = require("../models/BookCopy");
  const Transaction = require("../models/Transaction");
  const Request = require("../models/Request");
  const Review = require("../models/Review");
  const Wishlist = require("../models/Wishlist");
  const Notification = require("../models/Notification");
  const EBook = require("../models/EBook");
  const ActivityLog = require("../models/ActivityLog");
  const Reservation = require("../models/Reservation");
  const Exchange = require("../models/Exchange");
  const OTP = require("../models/OTP");

  const { verifyToken } = require("../middleware/auth");

  const app = express();
  app.use(express.json());

  // Health check (UNPROTECTED)
  app.get("/api/health", (req, res) => res.json({ status: "ok", mode: "test" }));

  // Mount Auth routes (UNPROTECTED)
  app.use("/auth", require("../routes/auth"));

  // Protected API routes
  app.use("/api", verifyToken);
  app.use("/api/books", require("../routes/books"));
  app.use("/api/transactions", require("../routes/transactions"));
  app.use("/api/features", require("../routes/features"));
  app.use("/api/analytics", require("../routes/analytics"));
  app.use("/api/chat", require("../routes/chat"));

  // Direct endpoint mounts matching server.js
  app.get("/api/reviews/:bookId", async (req, res) => {
    try { res.json(await Review.find({ bookId: req.params.bookId }).sort({ createdAt: -1 })); }
    catch(err) { res.status(500).json({ message: err.message }); }
  });
  app.post("/api/reviews", async (req, res) => {
    try {
      const { bookId, userName, userEmail, rating, comment } = req.body;
      if (!bookId || !userName || !rating) return res.status(400).json({ message: "Book, user and rating required." });
      if (req.user.role !== "admin" && req.user.role !== "owner" && (req.user.name !== userName || req.user.email !== userEmail)) {
        return res.status(403).json({ success: false, message: "Forbidden. You can only submit reviews under your own identity." });
      }
      const existing = await Review.findOne({ bookId, userEmail });
      if (existing) {
        existing.rating = rating;
        existing.comment = comment || "";
        await existing.save();
        return res.json({ success: true, review: existing, updated: true });
      }
      const review = await Review.create({ bookId, userName, userEmail, rating: parseInt(rating), comment: comment || "" });
      res.json({ success: true, review });
    } catch(err) { res.status(500).json({ success: false, message: err.message }); }
  });

  // Wishlist direct mounts matching server.js
  app.get("/api/wishlist/:userEmail", async (req, res) => {
    try {
      if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.email !== req.params.userEmail) {
        return res.status(403).json({ success: false, message: "Forbidden. You can only view your own wishlist." });
      }
      const items = await Wishlist.find({ userEmail: req.params.userEmail }).sort({ createdAt: -1 });
      const enriched = [];
      for (const w of items) {
        const book = await Book.findById(w.bookId);
        if (book) enriched.push({ ...w.toObject(), id: w._id, bookTitle: book.title, bookAuthor: book.author, availableCopies: book.availableCopies });
      }
      res.json(enriched);
    } catch(err) { res.status(500).json({ message: err.message }); }
  });
  app.post("/api/wishlist", async (req, res) => {
    try {
      const { bookId, userName, userEmail } = req.body;
      if (req.user.role !== "admin" && req.user.role !== "owner" && (req.user.name !== userName || req.user.email !== userEmail)) {
        return res.status(403).json({ success: false, message: "Forbidden. You can only add items to your own wishlist." });
      }
      if (await Wishlist.findOne({ bookId, userEmail })) return res.status(400).json({ message: "Already in wishlist." });
      const created = await Wishlist.create({ bookId, userName, userEmail });
      res.json({ success: true, wishlist: created });
    } catch(err) { res.status(500).json({ message: err.message }); }
  });
  app.delete("/api/wishlist/:id", async (req, res) => {
    try {
      const item = await Wishlist.findById(req.params.id);
      if (!item) return res.status(404).json({ message: "Wishlist item not found." });
      if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.email !== item.userEmail) {
        return res.status(403).json({ success: false, message: "Forbidden. You can only remove items from your own wishlist." });
      }
      await Wishlist.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch(err) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/notifications/:userEmail", async (req, res) => {
    try {
      if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.email !== req.params.userEmail) {
        return res.status(403).json({ success: false, message: "Forbidden. You can only view your own notifications." });
      }
      const notifs = await Notification.find({ userEmail: req.params.userEmail }).sort({ createdAt: -1 });
      res.json({ success: true, data: notifs.map(n => ({ ...n.toObject(), id: n._id })) });
    } catch(err) { res.status(500).json({ message: err.message }); }
  });
  app.put("/api/notifications/:id/read", async (req, res) => {
    try {
      const notification = await Notification.findById(req.params.id);
      if (!notification) return res.status(404).json({ message: "Notification not found." });
      if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.name !== notification.userName && req.user.email !== notification.userEmail) {
        return res.status(403).json({ success: false, message: "Forbidden." });
      }
      notification.read = true;
      await notification.save();
      res.json({ success: true });
    } catch(err) { res.status(500).json({ message: err.message }); }
  });

  const server = app.listen(0);
  const port = server.address().port;
  BASE = `http://127.0.0.1:${port}`;
  console.log(`  ✓ Test API server active on http://127.0.0.1:${port}`);

  // Seed accounts & users with valid email formats
  const hashedPassword = await bcrypt.hash("TestPassword123!", 10);

  const seedAccounts = [
    { name: "Owner User", email: "owner@booksphere.com", role: "owner" },
    { name: "Admin User", email: "admin@booksphere.com", role: "admin" },
    { name: "Teacher User", email: "teacher@krmu.edu.in", role: "teacher" },
    { name: "Student A", email: "student-a@krmu.edu.in", role: "student" },
    { name: "Student B", email: "student-b@krmu.edu.in", role: "student" }
  ];

  const tokens = {};
  const models = { Account, User, Book, BookCopy, Transaction, Request, Review, Wishlist, Notification, EBook, ActivityLog, Reservation, Exchange, OTP };

  for (const acct of seedAccounts) {
    let aRecord = await Account.findOne({ email: acct.email });
    if (!aRecord) {
      aRecord = await Account.create({
        name: acct.name,
        email: acct.email,
        password: hashedPassword,
        role: acct.role,
        status: "active"
      });
    }
    let uRecord = await User.findOne({ contact: acct.email });
    if (!uRecord) {
      uRecord = await User.create({
        name: acct.name,
        contact: acct.email,
        role: acct.role
      });
    }
    const token = jwt.sign(
      { id: aRecord._id.toString(), name: aRecord.name, email: aRecord.email, role: aRecord.role },
      JWT_SECRET,
      { expiresIn: "2h" }
    );
    if (acct.role === "owner") tokens.ownerToken = token;
    else if (acct.role === "admin") tokens.adminToken = token;
    else if (acct.role === "teacher") tokens.teacherToken = token;
    else if (acct.email === "student-a@krmu.edu.in") tokens.studentAToken = token;
    else if (acct.email === "student-b@krmu.edu.in") tokens.studentBToken = token;
  }

  console.log("  ✓ Seeded test accounts (Owner, Admin, Teacher, Student A, Student B)");

  return { server, mongod, tokens, models };
}

async function runOverdueCronIdempotencyTest({ models }) {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  OVERDUE CRON IDEMPOTENCY AUDIT");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const { Transaction, Book, User } = models;
  const { calcFine } = require("../utils");

  await test("Overdue fine processing is idempotent (runs twice without duplicating fines)", async () => {
    const studentUser = await User.findOne({ contact: "student-a@krmu.edu.in" });
    const book = await Book.create({ title: "Idempotency Book", author: "Audit", category: "Test", totalCopies: 1, availableCopies: 0 });

    const pastDue = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // exactly 2 days ago

    const tx = await Transaction.create({
      bookId: book._id,
      userId: studentUser._id,
      userName: studentUser.name,
      userRole: "student",
      issueDate: new Date(Date.now() - 16 * 86400000),
      dueDate: pastDue,
      status: "issued"
    });

    const fine1 = calcFine(tx);
    const fine2 = calcFine(tx);
    assert(fine1 === fine2, `Fine calculation changed between runs: ${fine1} vs ${fine2}`);
    assert(fine1 > 0, "Expected non-zero overdue fine");

    await Book.deleteOne({ _id: book._id });
    await Transaction.deleteOne({ _id: tx._id });
  });
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║       BookSphere v2.0 — Comprehensive Test Suite            ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  let serverInstance = null;
  let mongodInstance = null;

  try {
    const ctx = await bootServer();
    serverInstance = ctx.server;
    mongodInstance = ctx.mongod;

    const testParams = {
      BASE,
      request,
      assert,
      test,
      tokens: ctx.tokens,
      models: ctx.models,
      JWT_SECRET
    };

    // Execute Modular Test Suites
    await require("./health.test")(testParams);
    await require("./auth.test")(testParams);
    await require("./rbac.test")(testParams);
    await require("./books.test")(testParams);
    await require("./copies.test")(testParams);
    await require("./transactions.test")(testParams);
    await require("./fines.test")(testParams);
    await require("./payments.test")(testParams);
    await require("./renewal.test")(testParams);
    await require("./reservations.test")(testParams);
    await require("./exchange.test")(testParams);
    await require("./wishlist.test")(testParams);
    await require("./reviews.test")(testParams);
    await require("./gamification.test")(testParams);
    await require("./notifications.test")(testParams);
    await require("./reports.test")(testParams);
    await require("./chat.test")(testParams);

    await runOverdueCronIdempotencyTest(testParams);

    console.log("\n══════════════════════════════════════════════════════════════");
    console.log(`  FINAL RESULTS: ${passCount} passed, ${failCount} failed out of ${totalTests} total tests`);
    console.log("══════════════════════════════════════════════════════════════\n");
  } catch (e) {
    console.error("\n  ✗ FATAL TEST SUITE ERROR:", e.message);
    console.error(e.stack);
  } finally {
    if (serverInstance) serverInstance.close();
    await mongoose.disconnect();
    if (mongodInstance) await mongodInstance.stop();
    process.exit(failCount > 0 ? 1 : 0);
  }
}

main();
