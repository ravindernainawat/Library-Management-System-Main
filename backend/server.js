// Force Google DNS — bypasses college/network blocks on mongodb.net SRV records
require("dns").setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();
const mongoSanitize = require("express-mongo-sanitize");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
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

// Routes
const authRoutes         = require("./routes/auth");
const bookRoutes         = require("./routes/books");
const transactionRoutes  = require("./routes/transactions");
const featureRoutes      = require("./routes/features");
const chatRoutes         = require("./routes/chat");
const { verifyToken }      = require("./middleware/auth");

const app = express();

// CORS must come first
app.use(cors());
app.use(express.json());

// Tell browser to STOP forcing HTTPS on localhost
app.use((req, res, next) => {
  res.removeHeader('Strict-Transport-Security');
  next();
});

// Prevent NoSQL Injection
app.use(mongoSanitize());

// Set security HTTP headers (disable CSP to prevent breaking existing CDNs/fonts)
app.use(helmet({ contentSecurityPolicy: false }));

// Prevent XSS attacks
app.use(xss());

// Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", globalLimiter);

app.use(express.static(path.join(__dirname, "..", "frontend")));

// ============ DB ============
const fs = require("fs");
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/booksphere";
let mongod = null; // keep reference for graceful shutdown

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    console.log("  ✓ Connected to MongoDB");
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

  if (await Account.countDocuments() > 0) return;
  console.log("  → Seeding...");

  let QRCode; try { QRCode = require("qrcode"); } catch(e) {}
  
  let bcrypt; try { bcrypt = require("bcryptjs"); } catch(e) {}
  const hash = async (pw) => bcrypt ? await bcrypt.hash(pw, 10) : pw;

  await Account.insertMany([
    { name: "Owner",    email: "owner@booksphere.com",     password: await hash("owner123"),     role: "owner",   status: "active" },
    { name: "Admin",    email: "admin@booksphere.com",     password: await hash("admin123"),     role: "admin",   status: "active" },
    { name: "Teacher",  email: "teacher@booksphere.com",   password: await hash("teacher123"),   role: "teacher", status: "active" },
    { name: "Student",  email: "student@booksphere.com",   password: await hash("student123"),   role: "student", status: "active" },
    { name: "Rahul",    email: "rahul@booksphere.com",     password: await hash("rahul123"),     role: "student", status: "active" },
    { name: "Priya",    email: "priya@booksphere.com",     password: await hash("priya123"),     role: "student", status: "active" },
  ]);
  await User.insertMany([
    { name: "Student",  contact: "student@booksphere.com", role: "student" },
    { name: "Teacher",  contact: "teacher@booksphere.com", role: "teacher" },
    { name: "Rahul",    contact: "rahul@booksphere.com",   role: "student" },
    { name: "Priya",    contact: "priya@booksphere.com",   role: "student" },
  ]);

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

  console.log("  ✓ Seeded (6 accounts, 10 books with copies+QR, 2 eBooks)");
  console.log("  🔑 owner@booksphere.com/owner123 | admin@booksphere.com/admin123 | teacher@booksphere.com/teacher123 | student@booksphere.com/student123");
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
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    const result = [];
    for (const u of users) {
      const issuedCount = await Transaction.countDocuments({ userId: u._id, status: "issued" });
      const account = await Account.findOne({ email: u.contact });
      result.push({ 
        ...u.toObject(), 
        id: u._id, 
        issuedCount, 
        status: account ? account.status : "active", 
        blockedReason: account ? account.blockedReason : "",
        accountId: account ? account._id : null
      });
    }
    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/users", async (req, res) => {
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

app.delete("/api/users/:id", async (req, res) => {
  try {
    const hasActive = await Transaction.findOne({ userId: req.params.id, status: "issued" });
    if (hasActive) return res.status(400).json({ message: "Cannot delete — user has unreturned books." });
    const user = await User.findByIdAndDelete(req.params.id);
    if (user) logActivity("Delete User", "Admin", `Deleted user ${user.name}`);
    res.json({ success: true, name: user ? user.name : "" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ REQUESTS ============
app.get("/api/requests", async (req, res) => {
  try {
    const requests = await Request.find().sort({ createdAt: -1 });
    res.json(requests.map(r => ({ ...r.toObject(), id: r._id })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/requests", async (req, res) => {
  try {
    const { bookId, userName, userEmail } = req.body;
    const book = await Book.findById(bookId);
    if (!book || book.availableCopies <= 0) return res.status(400).json({ message: "Book not available." });
    const exists = await Request.findOne({ bookId, userName, status: "pending" });
    if (exists) return res.status(400).json({ message: "You already have a pending request for this book." });
    const request = await Request.create({ bookId, bookTitle: book.title, userName, userEmail, status: "pending" });
    res.json({ success: true, request: { ...request.toObject(), id: request._id } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put("/api/requests/:id/approve", async (req, res) => {
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

app.put("/api/requests/:id/issue", async (req, res) => {
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

app.put("/api/requests/:id/reject", async (req, res) => {
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
    const existing = await Review.findOne({ bookId, userEmail });
    if (existing) { existing.rating = rating; existing.comment = comment||""; await existing.save(); return res.json({ success: true, review: existing, updated: true }); }
    const review = await Review.create({ bookId, userName, userEmail, rating: parseInt(rating), comment: comment||"" });
    res.json({ success: true, review });
  } catch(err) { res.status(500).json({ message: err.message }); }
});

// ============ WISHLIST ============
app.get("/api/wishlist/:userEmail", async (req, res) => {
  try {
    const items = await Wishlist.find({ userEmail: req.params.userEmail }).sort({ createdAt: -1 });
    const enriched = [];
    for (const w of items) { const book = await Book.findById(w.bookId); if (book) enriched.push({ ...w.toObject(), id: w._id, bookTitle: book.title, bookAuthor: book.author, availableCopies: book.availableCopies }); }
    res.json(enriched);
  } catch(err) { res.status(500).json({ message: err.message }); }
});
app.post("/api/wishlist", async (req, res) => {
  try {
    const { bookId, userName, userEmail } = req.body;
    if (await Wishlist.findOne({ bookId, userEmail })) return res.status(400).json({ message: "Already in wishlist." });
    res.json({ success: true, item: await Wishlist.create({ bookId, userName, userEmail }) });
  } catch(err) { res.status(500).json({ message: err.message }); }
});
app.delete("/api/wishlist/:id", async (req, res) => {
  try { await Wishlist.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch(err) { res.status(500).json({ message: err.message }); }
});

// ============ NOTIFICATIONS ============
app.get("/api/notifications/:userEmail", async (req, res) => {
  try { res.json((await Notification.find({ userEmail: req.params.userEmail }).sort({ createdAt: -1 }).limit(30)).map(n => ({ ...n.toObject(), id: n._id }))); } catch(err) { res.status(500).json({ message: err.message }); }
});
app.get("/api/notifications/user/:userName", async (req, res) => {
  try { res.json((await Notification.find({ userName: req.params.userName }).sort({ createdAt: -1 }).limit(30)).map(n => ({ ...n.toObject(), id: n._id }))); } catch(err) { res.status(500).json({ message: err.message }); }
});
app.put("/api/notifications/:id/read", async (req, res) => {
  try { await Notification.findByIdAndUpdate(req.params.id, { read: true }); res.json({ success: true }); } catch(err) { res.status(500).json({ message: err.message }); }
});
app.put("/api/notifications/read-all/:userEmail", async (req, res) => {
  try { await Notification.updateMany({ userEmail: req.params.userEmail }, { read: true }); res.json({ success: true }); } catch(err) { res.status(500).json({ message: err.message }); }
});

// ============ RECOMMENDATIONS ============
app.get("/api/recommendations/:userName", async (req, res) => {
  try {
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
app.get("/api/activity", async (req, res) => {
  try { res.json(await ActivityLog.find().sort({ createdAt: -1 }).limit(50)); } catch(err) { res.status(500).json({ message: err.message }); }
});

// ============ STATS / REPORTS ============
app.get("/api/stats", async (req, res) => {
  try {
    const { role, name } = req.query;
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

app.get("/api/reports/overview", async (req, res) => {
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

app.get("/api/reports/popular-books", async (req, res) => {
  try {
    const result = await Transaction.aggregate([{ $group: { _id: "$bookId", issueCount: { $sum: 1 } } }, { $sort: { issueCount: -1 } }, { $limit: 10 }]);
    const enriched = [];
    for (const r of result) { const book = await Book.findById(r._id); if (book) enriched.push({ title: book.title, author: book.author, category: book.category, issueCount: r.issueCount }); }
    res.json(enriched);
  } catch(err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/reports/active-users", async (req, res) => {
  try {
    const result = await Transaction.aggregate([{ $group: { _id: "$userName", borrowCount: { $sum: 1 } } }, { $sort: { borrowCount: -1 } }, { $limit: 10 }]);
    res.json(result.map(r => ({ userName: r._id, borrowCount: r.borrowCount })));
  } catch(err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/reports/categories", async (req, res) => {
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
app.post("/api/ebooks", async (req, res) => {
  try {
    const { title, author, category, description, pdfUrl, pages, language } = req.body;
    if (!title || !author || !pdfUrl) return res.status(400).json({ message: "Title, author and PDF URL required." });
    const ebook = await EBook.create({ title, author, category: category||"General", description: description||"", pdfUrl, pages: pages||0, language: language||"English" });
    res.json({ success: true, ebook });
  } catch(err) { res.status(500).json({ message: err.message }); }
});
app.delete("/api/ebooks/:id", async (req, res) => {
  try { const e = await EBook.findByIdAndDelete(req.params.id); res.json({ success: true, title: e ? e.title : "" }); } catch(err) { res.status(500).json({ message: err.message }); }
});

// ============ EMAIL (Nodemailer) ============
// Email function moved to utils.js to avoid circular dependencies and make it reusable

// ============ REMINDER CRON ============
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
} catch(e) { console.log("  ⚠ node-cron not available, reminders disabled"); }

// ============ CATCH-ALL ============
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "..", "frontend", "index.html")));

// ============ START ============
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("");
  console.log("  ╔══════════════════════════════════════╗");
  console.log("  ║   BookSphere Server v2.0             ║");
  console.log(`  ║   http://localhost:${PORT}               ║`);
  console.log("  ║   All features active                ║");
  console.log("  ╚══════════════════════════════════════╝");
  console.log("");
});
