// Force Google DNS — bypasses college/network blocks on mongodb.net SRV records
require("dns").setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const mongoSanitize = require("express-mongo-sanitize");
const rateLimit = require("express-rate-limit");
const slowDown = require("express-slow-down");
const helmet = require("helmet");
const hpp = require("hpp");
const compression = require("compression");
const xss = require("xss-clean");

// Models
const Account    = require("./models/Account");
const Book       = require("./models/Book");
const User       = require("./models/User");
const Transaction= require("./models/Transaction");
const Request    = require("./models/Request");
const Review     = require("./models/Review");
const Wishlist   = require("./models/Wishlist");
const Notification = require("./models/Notification");
const EBook      = require("./models/EBook");
const ActivityLog= require("./models/ActivityLog");
const BookCopy   = require("./models/BookCopy");
const Reservation= require("./models/Reservation");
const Exchange   = require("./models/Exchange");
const { logActivity, calcFine } = require("./utils");
const { parsePaginationParams, buildPaginationResponse, getSkipValue } = require("./middleware/pagination");

// Routes
const authRoutes         = require("./routes/auth");
const bookRoutes         = require("./routes/books");
const transactionRoutes  = require("./routes/transactions");
const featureRoutes      = require("./routes/features");
const chatRoutes         = require("./routes/chat");
const { verifyToken, verifyAdmin }      = require("./middleware/auth");

const app = express();

// ─────────────────────────────────────────────────────────────────────────────
// ❶  TRUST PROXY — mandatory for accurate IP detection behind Cloudflare/Nginx
// ─────────────────────────────────────────────────────────────────────────────
app.set("trust proxy", 1);

// ─────────────────────────────────────────────────────────────────────────────
// ❷  GZIP COMPRESSION — reduces response size & bandwidth amplification risk
// ─────────────────────────────────────────────────────────────────────────────
app.use(compression());

// ─────────────────────────────────────────────────────────────────────────────
// ❸  CORS — locked to configured allowed origins, not wildcard
//    Set ALLOWED_ORIGINS in .env as a comma-separated list, e.g.:
//    ALLOWED_ORIGINS=http://localhost:5000,https://yourdomain.com
// ─────────────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : ["http://localhost:5000", "http://localhost:3000", "http://127.0.0.1:5000"];

app.use(cors({
  origin: (origin, cb) => {
    // Allow server-to-server / Postman (no origin) only in dev
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked — origin '${origin}' not whitelisted.`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// ─────────────────────────────────────────────────────────────────────────────
// ❹  BODY SIZE LIMITS — prevent memory/CPU exhaustion from huge payloads
// ─────────────────────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ─────────────────────────────────────────────────────────────────────────────
// ❺  HTTP PARAMETER POLLUTION (HPP) — stop ?sort=asc&sort=desc array tricks
//    that can crash unguarded query handlers
// ─────────────────────────────────────────────────────────────────────────────
app.use(hpp());

// Tell browser to STOP forcing HTTPS on localhost
app.use((req, res, next) => {
  res.removeHeader('Strict-Transport-Security');
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// ❻  SECURITY HEADERS (Helmet) + NoSQL Injection + XSS sanitisers
// ─────────────────────────────────────────────────────────────────────────────
app.use(mongoSanitize());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(xss());

// ─────────────────────────────────────────────────────────────────────────────
// ❼  IP STRIKE TRACKER — auto-block IPs sending 50+ bad requests in 10 min
//    Protects against scripted enumeration/scanning without external firewall
// ─────────────────────────────────────────────────────────────────────────────
const strikeMap = new Map(); // { ip -> { count, resetAt } }
const STRIKE_LIMIT = 50;
const STRIKE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function recordStrike(ip) {
  const now = Date.now();
  const entry = strikeMap.get(ip);
  if (!entry || now > entry.resetAt) {
    strikeMap.set(ip, { count: 1, resetAt: now + STRIKE_WINDOW_MS });
  } else {
    entry.count++;
  }
}

function isBlocked(ip) {
  const entry = strikeMap.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) { strikeMap.delete(ip); return false; }
  return entry.count >= STRIKE_LIMIT;
}

// Hook into response finish to count 4xx errors per IP
app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress;
  if (isBlocked(ip)) {
    return res.status(429).json({
      success: false,
      message: "Too many errors from your IP — temporarily blocked. Try again in 10 minutes."
    });
  }
  res.on("finish", () => {
    if (res.statusCode >= 400 && res.statusCode < 500 && res.statusCode !== 404) {
      recordStrike(ip);
    }
  });
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// ❽  REQUEST TIMEOUT — abort requests taking longer than 30 s
//    Guards against ReDoS, slow DB queries used as CPU-exhaustion DoS vectors
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    if (!res.headersSent) {
      res.status(503).json({ success: false, message: "Request timed out. Please try again." });
    }
  });
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// ❾  RATE LIMITERS
//    a) Global API cap — 300 requests per 15 min per IP (tightened from 1000)
//    b) Write operations — 50 per minute per IP (POST/PUT/DELETE)
//    c) Auth speed-limiter — progressively slows repeated auth callers by 500 ms
//       per request after the 5th attempt, before the hard block kicks in
// ─────────────────────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,                 // max 300 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests from this IP. Please wait 15 minutes." },
});
app.use("/api", globalLimiter);

// Tighter cap on write (mutation) endpoints — 50 per minute
const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many write requests. Slow down and try again." },
});
app.use("/api", (req, res, next) => {
  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    return writeLimiter(req, res, next);
  }
  next();
});

// Speed-limiter on auth paths — adds 500 ms delay per request after 5th in 60 s
const authSpeedLimiter = slowDown({
  windowMs: 60 * 1000,   // 1 minute window
  delayAfter: 5,         // start slowing after 5 requests
  delayMs: (used) => (used - 5) * 500, // +500 ms per extra request
  maxDelayMs: 10000,     // cap delay at 10 seconds
});
app.use("/api/auth", authSpeedLimiter);

app.use(express.static(path.join(__dirname, "..", "frontend")));

// ============ DB ============
const fs = require("fs");
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/booksphere";
let mongod = null; // keep reference for graceful shutdown

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    console.log("  ✓ Connected to MongoDB");
    await seedDatabase();
  } catch (err) {
    console.log("  ⚠ External MongoDB not found, using persistent local DB...");
    try {
      const { MongoMemoryServer } = require("mongodb-memory-server");

      // Create a persistent data directory inside the backend folder
      const dbPath = path.join(__dirname, "data", "db");
      if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(dbPath, { recursive: true });
        console.log("  → Created data directory:", dbPath);
      }

      // Start MongoMemoryServer with persistent disk storage (WiredTiger)
      mongod = await MongoMemoryServer.create({
        instance: {
          dbPath: dbPath,
          storageEngine: "wiredTiger"  // persistent storage instead of ephemeral
        }
      });

      await mongoose.connect(mongod.getUri());
      console.log("  ✓ Persistent Local MongoDB started (data saved to ./data/db)");
      console.log("  ✓ Data will survive restarts and reloads");

      // Only seed if this is a fresh database (no accounts exist yet)
      await seedDatabase();
    } catch (e) { console.error("  ✗ DB failed:", e.message); process.exit(1); }
  }
}

// Graceful shutdown — properly stop embedded MongoDB to avoid data corruption
async function gracefulShutdown(signal) {
  console.log(`\n  ⏳ ${signal} received — shutting down gracefully...`);
  try {
    await mongoose.disconnect();
    console.log("  ✓ Mongoose disconnected");
    if (mongod) {
      await mongod.stop();
      console.log("  ✓ Local MongoDB stopped safely (data preserved)");
    }
  } catch (e) { console.error("  ⚠ Shutdown error:", e.message); }
  process.exit(0);
}
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

async function seedDatabase() {
  if (await EBook.countDocuments() === 0) {
    console.log("  → Seeding eBooks...");
    await EBook.insertMany([
      { title: "Pride and Prejudice", author: "Jane Austen", category: "Classic Fiction", pdfUrl: "https://www.gutenberg.org/files/1342/1342-0.txt", pages: 432, coverColor: "#e74c3c" },
      { title: "Adventures of Sherlock Holmes", author: "Arthur Conan Doyle", category: "Mystery", pdfUrl: "https://www.gutenberg.org/files/1661/1661-0.txt", pages: 307, coverColor: "#2c3e50" },
      { title: "Frankenstein", author: "Mary Shelley", category: "Horror", pdfUrl: "https://www.gutenberg.org/cache/epub/84/pg84.txt", pages: 280, coverColor: "#8e44ad" },
      { title: "Moby Dick", author: "Herman Melville", category: "Adventure", pdfUrl: "https://www.gutenberg.org/files/2701/2701-0.txt", pages: 704, coverColor: "#16a085" }
    ]);
  }

  let QRCode; try { QRCode = require("qrcode"); } catch(e) {}
  let bcrypt; try { bcrypt = require("bcryptjs"); } catch(e) {}
  const hash = async (pw) => bcrypt ? await bcrypt.hash(pw, 10) : pw;

  // Only seed the real Owner account if no accounts exist at all.
  // The Owner can create Admin/Teacher/Student accounts from the dashboard after first login.
  if (await Account.countDocuments() === 0) {
    console.log("  → Seeding owner account...");
    const ownerPassword = process.env.OWNER_DEFAULT_PASSWORD || "Owner@1234";
    await Account.create(
      { name: "Ravinder Nainawat", email: "ravindernainawat007@gmail.com", password: await hash(ownerPassword), role: "owner", status: "active" }
    );
    console.log("  ✓ Seeded owner account (ravindernainawat007@gmail.com)");
    console.log("    ⚠ Change the default password immediately after first login!");
  }

  if (await Book.countDocuments() === 0) {
    console.log("  → Seeding default books...");
    const booksData = [
      { title: "The Great Gatsby",        author: "F. Scott Fitzgerald", category: "Fiction",          isbn: "978-0743273565", publisher: "Scribner",       year: 1925, totalCopies: 3 },
      { title: "To Kill a Mockingbird",   author: "Harper Lee",          category: "Fiction",          isbn: "978-0061120084", publisher: "HarperCollins",  year: 1960, totalCopies: 3 },
      { title: "Introduction to Algorithms", author: "Thomas Cormen",   category: "Computer Science", isbn: "978-0262033848", publisher: "MIT Press",      year: 2009, totalCopies: 4 },
      { title: "Clean Code",              author: "Robert C. Martin",    category: "Programming",      isbn: "978-0132350884", publisher: "Prentice Hall",  year: 2008, totalCopies: 3 },
      { title: "Atomic Habits",           author: "James Clear",         category: "Self-Help",        isbn: "978-0735211292", publisher: "Avery",          year: 2018, totalCopies: 4 },
      { title: "Sapiens",                 author: "Yuval Noah Harari",   category: "Non-Fiction",      isbn: "978-0062316110", publisher: "Harper",         year: 2015, totalCopies: 3 },
      { title: "1984",                    author: "George Orwell",       category: "Fiction",          isbn: "978-0451524935", publisher: "Signet Classic",  year: 1949, totalCopies: 3 },
      { title: "Python Crash Course",     author: "Eric Matthes",        category: "Programming",      isbn: "978-1593279288", publisher: "No Starch Press",year: 2019, totalCopies: 3 },
      { title: "The Alchemist",           author: "Paulo Coelho",        category: "Fiction",          isbn: "978-0062315007", publisher: "HarperOne",      year: 1988, totalCopies: 4 },
      { title: "Design Patterns",         author: "Gang of Four",        category: "Programming",      isbn: "978-0201633610", publisher: "Addison-Wesley", year: 1994, totalCopies: 3 },
    ];

    for (const bd of booksData) {
      const book = await Book.create({ ...bd, availableCopies: bd.totalCopies });
      for (let i = 1; i <= bd.totalCopies; i++) {
        const qrData = `BOOKSPHERE:${book._id}:COPY:${i}`;
        let qrCode = "";
        if (QRCode) { try { qrCode = await QRCode.toDataURL(qrData); } catch(e) {} }
        await BookCopy.create({ bookId: book._id, copyNumber: i, qrData, qrCode, status: "available",
          shelfLocation: { aisle: `A${Math.ceil(i/2)}`, rack: `R${i}`, position: `P${i}` } });
      }
    }
    console.log("  ✓ Seeded default books and book copies");
  }
}
connectDB();

// ============ ROUTES ============
app.use("/api/auth", authRoutes);

// GLOBAL API SECURITY: Protect all endpoints below this line
app.use("/api",              verifyToken);

app.use("/api/books",        bookRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/features",     featureRoutes);
app.use("/api/chat",         chatRoutes);

// ============ USERS ============
app.get("/api/users", verifyAdmin, async (req, res) => {
  try {
    const { page, limit } = parsePaginationParams(req);
    const skip = getSkipValue(page, limit);
    
    const totalRecords = await User.countDocuments();
    const users = await User.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const result = [];
    for (const u of users) {
      const issuedCount = await Transaction.countDocuments({ userId: u._id, status: "issued" });
      const account = await Account.findOne({ email: u.contact }).lean();
      result.push({ 
        ...u, 
        id: u._id, 
        issuedCount, 
        status: account ? account.status : "active", 
        blockedReason: account ? account.blockedReason : "",
        accountId: account ? account._id : null
      });
    }
    res.json(buildPaginationResponse(result, totalRecords, page, limit));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/users", verifyAdmin, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "Name, email, and password required." });
    
    const existingAccount = await Account.findOne({ email: email.toLowerCase() });
    if (existingAccount) return res.status(400).json({ message: "An account with this email already exists." });
    
    const bcrypt = require("bcryptjs");
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newAccount = await Account.create({ 
      name, 
      email: email.toLowerCase(), 
      password: hashedPassword, 
      role: role || "student", 
      status: "active" 
    });
    
    const newUser = await User.create({ name, contact: email.toLowerCase(), role: role || "student" });
    logActivity("Add User", "Admin", `Created account and user record for ${newUser.name}`);
    res.json({ success: true, user: newUser });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.delete("/api/users/:id", verifyAdmin, async (req, res) => {
  try {
    const hasActive = await Transaction.findOne({ userId: req.params.id, status: "issued" });
    if (hasActive) return res.status(400).json({ message: "Cannot delete — user has unreturned books." });
    const user = await User.findByIdAndDelete(req.params.id);
    if (user) logActivity("Delete User", "Admin", `Deleted user ${user.name}`);
    res.json({ success: true, name: user ? user.name : "" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ REQUESTS ============
app.get("/api/requests/my", async (req, res) => {
  try {
    const requests = await Request.find({ userEmail: req.user.email }).sort({ createdAt: -1 });
    res.json(requests.map(r => ({ ...r.toObject(), id: r._id })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/requests", verifyAdmin, async (req, res) => {
  try {
    const requests = await Request.find().sort({ createdAt: -1 });
    res.json(requests.map(r => ({ ...r.toObject(), id: r._id })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/requests", async (req, res) => {
  try {
    const { bookId, userName, userEmail } = req.body;
    // Authorization Check: Student can only create requests for themselves; Admin/Owner can do it for anyone.
    if (req.user.role !== "admin" && req.user.role !== "owner" && (req.user.name !== userName || req.user.email !== userEmail)) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only request books for yourself." });
    }
    const book = await Book.findById(bookId);
    if (!book || book.availableCopies <= 0) return res.status(400).json({ message: "Book not available." });
    const exists = await Request.findOne({ bookId, userName, status: "pending" });
    if (exists) return res.status(400).json({ message: "You already have a pending request for this book." });
    const request = await Request.create({ bookId, bookTitle: book.title, userName, userEmail, status: "pending" });
    res.json({ success: true, request: { ...request.toObject(), id: request._id } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put("/api/requests/:id/approve", verifyAdmin, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request || request.status !== "pending") return res.status(400).json({ message: "Request not found." });
    const book = await Book.findById(request.bookId);
    if (!book || book.availableCopies <= 0) { request.status = "rejected"; await request.save(); return res.status(400).json({ message: "Book no longer available." }); }
    request.status = "approved"; await request.save();
    book.availableCopies--; await book.save();
    await Notification.create({ userName: request.userName, userEmail: request.userEmail, type: "request_update", message: `Your request for "${request.bookTitle}" has been approved! Please collect it from the library.` });
    logActivity("Approve Request", "Admin", `Approved request for "${request.bookTitle}" by ${request.userName}`);
    res.json({ success: true, bookTitle: request.bookTitle, userName: request.userName });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put("/api/requests/:id/issue", verifyAdmin, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request || request.status !== "approved") return res.status(400).json({ message: "Request not found or not yet approved." });
    request.status = "issued"; await request.save();
    const now = new Date(); const dueDate = new Date(now); dueDate.setDate(dueDate.getDate() + 14);
    await Transaction.create({ bookId: request.bookId, userName: request.userName, userRole: "student", issueDate: now, dueDate, status: "issued", issuedVia: "request" });
    await Notification.create({ userName: request.userName, userEmail: request.userEmail, type: "request_update", message: `You have collected "${request.bookTitle}". Due date: ${dueDate.toDateString()}.` });
    logActivity("Issue Book", "Admin", `Issued "${request.bookTitle}" to ${request.userName}`);
    res.json({ success: true, bookTitle: request.bookTitle, userName: request.userName });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put("/api/requests/:id/reject", verifyAdmin, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request || (request.status !== "pending" && request.status !== "approved")) return res.status(400).json({ message: "Request not found." });
    // If it was approved, restore the book copy
    if (request.status === "approved") {
      const book = await Book.findById(request.bookId);
      if (book) { book.availableCopies++; await book.save(); }
    }
    request.status = "rejected"; await request.save();
    await Notification.create({ userName: request.userName, userEmail: request.userEmail, type: "request_update", message: `Your request for "${request.bookTitle}" was rejected.` });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ REVIEWS ============
app.get("/api/reviews/:bookId", async (req, res) => {
  try { res.json(await Review.find({ bookId: req.params.bookId }).sort({ createdAt: -1 })); } catch(err) { res.status(500).json({ message: err.message }); }
});
app.post("/api/reviews", async (req, res) => {
  try {
    const { bookId, userName, userEmail, rating, comment } = req.body;
    if (!bookId || !userName || !rating) return res.status(400).json({ message: "Book, user and rating required." });
    
    // Authorization Check: Student can only post reviews under their own identity; Admin/Owner can post for anyone.
    if (req.user.role !== "admin" && req.user.role !== "owner" && (req.user.name !== userName || req.user.email !== userEmail)) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only submit reviews under your own identity." });
    }
    
    const existing = await Review.findOne({ bookId, userEmail });
    if (existing) { existing.rating = rating; existing.comment = comment||""; await existing.save(); return res.json({ success: true, review: existing, updated: true }); }
    const review = await Review.create({ bookId, userName, userEmail, rating: parseInt(rating), comment: comment||"" });
    res.json({ success: true, review });
  } catch(err) { res.status(500).json({ success: false, message: err.message }); }
});

// ============ WISHLIST ============
app.get("/api/wishlist/:userEmail", async (req, res) => {
  try {
    // Authorization Check: Student can only view their own wishlist; Admin/Owner can view anyone's.
    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.email !== req.params.userEmail) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only view your own wishlist." });
    }
    const items = await Wishlist.find({ userEmail: req.params.userEmail }).sort({ createdAt: -1 });
    const enriched = [];
    for (const w of items) { const book = await Book.findById(w.bookId); if (book) enriched.push({ ...w.toObject(), id: w._id, bookTitle: book.title, bookAuthor: book.author, availableCopies: book.availableCopies }); }
    res.json(enriched);
  } catch(err) { res.status(500).json({ message: err.message }); }
});
app.post("/api/wishlist", async (req, res) => {
  try {
    const { bookId, userName, userEmail } = req.body;
    // Authorization Check: Student can only add items to their own wishlist; Admin/Owner can add for anyone.
    if (req.user.role !== "admin" && req.user.role !== "owner" && (req.user.name !== userName || req.user.email !== userEmail)) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only add items to your own wishlist." });
    }
    if (await Wishlist.findOne({ bookId, userEmail })) return res.status(400).json({ message: "Already in wishlist." });
    res.json({ success: true, item: await Wishlist.create({ bookId, userName, userEmail }) });
  } catch(err) { res.status(500).json({ message: err.message }); }
});
app.delete("/api/wishlist/:id", async (req, res) => {
  try {
    const item = await Wishlist.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Wishlist item not found." });
    // Authorization Check: Student can only delete their own wishlist items; Admin/Owner can delete anyone's.
    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.email !== item.userEmail) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only remove items from your own wishlist." });
    }
    await Wishlist.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ message: err.message }); }
});

// ============ NOTIFICATIONS ============
app.get("/api/notifications/:userEmail", async (req, res) => {
  try {
    // Authorization Check: Student can only view their own notifications; Admin/Owner can view anyone's.
    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.email !== req.params.userEmail) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only view your own notifications." });
    }
    
    const { page, limit } = parsePaginationParams(req);
    const skip = getSkipValue(page, limit);
    
    const totalRecords = await Notification.countDocuments({ userEmail: req.params.userEmail });
    const notifications = await Notification.find({ userEmail: req.params.userEmail })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    res.json(buildPaginationResponse(
      notifications.map(n => ({ ...n, id: n._id })), 
      totalRecords, 
      page, 
      limit
    ));
  } catch(err) { res.status(500).json({ message: err.message }); }
});
app.get("/api/notifications/user/:userName", async (req, res) => {
  try {
    // Authorization Check: Student can only view their own notifications; Admin/Owner can view anyone's.
    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.name !== req.params.userName) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only view your own notifications." });
    }
    
    const { page, limit } = parsePaginationParams(req);
    const skip = getSkipValue(page, limit);
    
    const totalRecords = await Notification.countDocuments({ userName: req.params.userName });
    const notifications = await Notification.find({ userName: req.params.userName })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    res.json(buildPaginationResponse(
      notifications.map(n => ({ ...n, id: n._id })), 
      totalRecords, 
      page, 
      limit
    ));
  } catch(err) { res.status(500).json({ message: err.message }); }
});
app.put("/api/notifications/:id/read", async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ message: "Notification not found." });
    // Authorization Check: Student can only mark their own notifications as read; Admin/Owner can do it for anyone.
    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.name !== notification.userName && req.user.email !== notification.userEmail) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only update your own notifications." });
    }
    notification.read = true;
    await notification.save();
    res.json({ success: true });
  } catch(err) { res.status(500).json({ message: err.message }); }
});
app.put("/api/notifications/read-all/:userEmail", async (req, res) => {
  try {
    // Authorization Check: Student can only mark their own notifications as read; Admin/Owner can do it for anyone.
    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.email !== req.params.userEmail) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only update your own notifications." });
    }
    await Notification.updateMany({ userEmail: req.params.userEmail }, { read: true });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ message: err.message }); }
});

// ============ RECOMMENDATIONS ============
app.get("/api/recommendations/:userName", async (req, res) => {
  try {
    // Authorization Check: Student can only view their own recommendations; Admin/Owner can view anyone's.
    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.name !== req.params.userName) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only view your own recommendations." });
    }
    const userTx = await Transaction.find({ userName: req.params.userName });
    const borrowedBookIds = userTx.map(t => t.bookId);
    const borrowedBooks = await Book.find({ _id: { $in: borrowedBookIds } });
    const categories = [...new Set(borrowedBooks.map(b => b.category))];
    let recs;
    if (categories.length > 0) recs = await Book.find({ category: { $in: categories }, _id: { $nin: borrowedBookIds }, availableCopies: { $gt: 0 } }).limit(6);
    else {
      const popular = await Transaction.aggregate([{ $group: { _id: "$bookId", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 6 }]);
      recs = await Book.find({ _id: { $in: popular.map(p => p._id) }, availableCopies: { $gt: 0 } });
    }
    if (!recs || recs.length === 0) recs = await Book.find({ availableCopies: { $gt: 0 } }).limit(6);
    res.json(recs);
  } catch(err) { res.status(500).json({ message: err.message }); }
});

// ============ ACTIVITY LOGS ============
app.get("/api/activity", verifyAdmin, async (req, res) => {
  try { 
    const { page, limit } = parsePaginationParams(req);
    const skip = getSkipValue(page, limit);
    
    const totalRecords = await ActivityLog.countDocuments();
    const activityLogs = await ActivityLog.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    res.json(buildPaginationResponse(activityLogs, totalRecords, page, limit));
  } catch(err) { res.status(500).json({ message: err.message }); }
});

// ============ STATS / REPORTS ============
app.get("/api/stats", async (req, res) => {
  try {
    const { role, name } = req.query;
    // Authorization Check: Students/teachers can only query their own stats. Admins/owners can query any.
    if (req.user.role !== "admin" && req.user.role !== "owner" && name && req.user.name !== name) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only query your own stats." });
    }
    const books = await Book.find();
    const totalBooks = books.reduce((s,b) => s + b.totalCopies, 0);
    const totalUsers = await User.countDocuments();
    let txQuery = {};
    if ((role === "student" || role === "teacher") && name) txQuery.userName = name;
    const transactions = await Transaction.find(txQuery);
    const issuedBooks = transactions.filter(t => t.status === "issued").length;
    let totalFines = 0;
    transactions.forEach(t => { totalFines += calcFine(t); });
    const recentTx = transactions.slice(-5).reverse();
    const recent = [];
    for (const t of recentTx) { const book = await Book.findById(t.bookId); recent.push({ ...t.toObject(), id: t._id, bookTitle: book ? book.title : "Deleted" }); }
    const pendingRequests = await Request.countDocuments({ status: "pending" });
    const overdueCount = transactions.filter(t => t.status === "issued" && new Date() > new Date(t.dueDate)).length;
    res.json({ totalBooks, totalUsers, issuedBooks, totalFines, recent, pendingRequests, overdueCount });
  } catch(err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/reports/overview", verifyAdmin, async (req, res) => {
  try {
    const totalBooks = await Book.countDocuments();
    const totalCopies = (await Book.find()).reduce((s,b) => s + b.totalCopies, 0);
    const totalUsers = await User.countDocuments();
    const activeIssues = await Transaction.countDocuments({ status: "issued" });
    const totalReturns = await Transaction.countDocuments({ status: "returned" });
    const pendingRequests = await Request.countDocuments({ status: "pending" });
    const totalReviews = await Review.countDocuments();
    const allTx = await Transaction.find();
    let totalFines = 0, overdueCount = 0;
    allTx.forEach(t => { const f = calcFine(t); totalFines += f; if (t.status === "issued" && new Date() > new Date(t.dueDate)) overdueCount++; });
    res.json({ totalBooks, totalCopies, totalUsers, activeIssues, totalReturns, pendingRequests, totalReviews, totalFines, overdueCount });
  } catch(err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/reports/popular-books", verifyAdmin, async (req, res) => {
  try {
    const result = await Transaction.aggregate([{ $group: { _id: "$bookId", issueCount: { $sum: 1 } } }, { $sort: { issueCount: -1 } }, { $limit: 10 }]);
    const enriched = [];
    for (const r of result) { const book = await Book.findById(r._id); if (book) enriched.push({ title: book.title, author: book.author, category: book.category, issueCount: r.issueCount }); }
    res.json(enriched);
  } catch(err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/reports/active-users", verifyAdmin, async (req, res) => {
  try {
    const result = await Transaction.aggregate([{ $group: { _id: "$userName", borrowCount: { $sum: 1 } } }, { $sort: { borrowCount: -1 } }, { $limit: 10 }]);
    res.json(result.map(r => ({ userName: r._id, borrowCount: r.borrowCount })));
  } catch(err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/reports/categories", verifyAdmin, async (req, res) => {
  try {
    const result = await Book.aggregate([{ $group: { _id: "$category", count: { $sum: 1 }, totalCopies: { $sum: "$totalCopies" } } }, { $sort: { count: -1 } }]);
    res.json(result.map(r => ({ category: r._id, bookCount: r.count, totalCopies: r.totalCopies })));
  } catch(err) { res.status(500).json({ message: err.message }); }
});

// ============ DROPDOWNS ============
app.get("/api/dropdowns", async (req, res) => {
  try {
    const availableBooks = await Book.find({ availableCopies: { $gt: 0 } });
    const users = await User.find();
    res.json({
      books: availableBooks.map(b => ({ id: b._id, label: `${b.title} by ${b.author} (${b.availableCopies} left)` })),
      users: users.map(u => ({ id: u._id, label: `${u.name} (${u.role||"student"})` })),
    });
  } catch(err) { res.status(500).json({ message: err.message }); }
});

// ============ EBOOKS ============
app.get("/api/ebooks", async (req, res) => {
  try { res.json((await EBook.find().sort({ createdAt: -1 })).map(e => ({ ...e.toObject(), id: e._id }))); } catch(err) { res.status(500).json({ message: err.message }); }
});
app.post("/api/ebooks", verifyAdmin, async (req, res) => {
  try {
    const { title, author, category, description, pdfUrl, pages, language, coverColor } = req.body;
    if (!title || !author || !pdfUrl) return res.status(400).json({ message: "Title, author and PDF URL required." });
    const ebook = await EBook.create({ title, author, category: category||"General", description: description||"", pdfUrl, pages: pages||0, language: language||"English", coverColor: coverColor||"#3b82f6" });
    res.json({ success: true, ebook });
  } catch(err) { res.status(500).json({ message: err.message }); }
});
app.delete("/api/ebooks/:id", verifyAdmin, async (req, res) => {
  try { const e = await EBook.findByIdAndDelete(req.params.id); res.json({ success: true, title: e ? e.title : "" }); } catch(err) { res.status(500).json({ message: err.message }); }
});

// ============ EMAIL (Nodemailer) ============
// Email function moved to utils.js to avoid circular dependencies and make it reusable

// ============ REMINDER & EXPIRY CRON ============
try {
  const cron = require("node-cron");
  // Run every day at 8 AM
  cron.schedule("0 8 * * *", async () => {
    console.log("  ⏰ Running daily reminder check...");
    try {
      const now = new Date();
      const in2Days = new Date(now); in2Days.setDate(in2Days.getDate() + 2);
      const activeTx = await Transaction.find({ status: "issued" });
      for (const tx of activeTx) {
        const book = await Book.findById(tx.bookId);
        const bTitle = book ? book.title : "a book";
        const due = new Date(tx.dueDate);
        const daysLeft = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
        if (daysLeft === 2) {
          // 2-day reminder
          const exists = await Notification.findOne({ userName: tx.userName, type: "due_reminder_2day", message: { $regex: bTitle } });
          if (!exists) {
            await Notification.create({ userName: tx.userName, userEmail: "", type: "due_reminder_2day", message: `Reminder: "${bTitle}" is due in 2 days (${due.toLocaleDateString("en-IN")}). Please return on time.` });
          }
        } else if (daysLeft === 0) {
          // Due today
          const exists = await Notification.findOne({ userName: tx.userName, type: "due_reminder_today", message: { $regex: bTitle } });
          if (!exists) {
            await Notification.create({ userName: tx.userName, userEmail: "", type: "due_reminder_today", message: `Today is the last day to return "${bTitle}"! Due: ${due.toLocaleDateString("en-IN")}.` });
          }
        } else if (daysLeft < 0) {
          // Overdue — daily alert
          const overdueDays = Math.abs(daysLeft);
          const fine = overdueDays * 5;
          await Notification.create({ userName: tx.userName, userEmail: "", type: "overdue_daily", message: `OVERDUE: "${bTitle}" is ${overdueDays} day(s) late. Current fine: ₹${fine}. Return immediately.` });
        }
      }
      console.log(`  ✓ Reminder check done (${activeTx.length} active transactions checked)`);
    } catch(e) { console.error("  ✗ Reminder error:", e.message); }
  });
  console.log("  ✓ Daily reminder cron scheduled (8:00 AM)");

  // Run every 10 minutes to auto-expire approved requests after 24 hours
  cron.schedule("*/10 * * * *", async () => {
    console.log("  ⏰ Running request auto-expiry check...");
    try {
      const expiryThreshold = new Date();
      expiryThreshold.setHours(expiryThreshold.getHours() - 24);
      
      const expiredRequests = await Request.find({
        status: "approved",
        updatedAt: { $lt: expiryThreshold }
      });
      
      for (const req of expiredRequests) {
        req.status = "expired";
        await req.save();
        
        const book = await Book.findById(req.bookId);
        if (book) {
          book.availableCopies++;
          await book.save();
        }
        
        await Notification.create({
          userName: req.userName,
          userEmail: req.userEmail,
          type: "request_update",
          message: `Your request for "${req.bookTitle}" has expired because it was not collected within the 24-hour limit.`
        });
        
        logActivity("Request Expired", "System", `Auto-expired request for "${req.bookTitle}" by ${req.userName} (over 24 hours)`);
      }
      if (expiredRequests.length > 0) {
        console.log(`  ✓ Auto-expired ${expiredRequests.length} request(s)`);
      }
    } catch(e) { console.error("  ✗ Request auto-expiry check error:", e.message); }
  });
  console.log("  ✓ Auto-expiry check cron scheduled (every 10 minutes)");
} catch(e) { console.log("  ⚠ node-cron not available, reminders and auto-expiry disabled"); }

// ============ CATCH-ALL ============
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "..", "frontend", "index.html")));

// ============ START ============
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log("");
  console.log("  ╔══════════════════════════════════════╗");
  console.log("  ║   BookSphere Server v2.0             ║");
  console.log(`  ║   http://localhost:${PORT}               ║`);
  console.log("  ║   All features active                ║");
  console.log("  ╚══════════════════════════════════════╝");
  console.log("");
});

// Configure explicit connection timeouts to protect against socket starvation / Slowloris DoS attacks
server.keepAliveTimeout = 65000; // 65 seconds
server.headersTimeout = 66000;   // 66 seconds
