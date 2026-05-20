const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();

// Models
const Account = require("./models/Account");
const Book = require("./models/Book");
const User = require("./models/User");
const Transaction = require("./models/Transaction");
const Request = require("./models/Request");
const Review = require("./models/Review");
const Wishlist = require("./models/Wishlist");
const Notification = require("./models/Notification");
const EBook = require("./models/EBook");
const ActivityLog = require("./models/ActivityLog");

async function logActivity(action, performedBy, details) {
  try { await ActivityLog.create({ action, performedBy, details }); } catch(err) {}
}

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, "..", "frontend")));

// ============ MONGODB ============
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/booksphere";
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("  ✓ Connected to MongoDB"))
  .catch((err) => {
    console.error("  ✗ MongoDB connection error:", err.message);
    console.log("  Make sure MongoDB is running or update MONGODB_URI in .env");
  });

// ============ AUTH ============
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ message: "All fields required." });
    
    const existing = await Account.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already registered." });
    
    const account = await Account.create({ name, email, password, role });
    
    if (role === "student") {
      await User.create({ name, contact: "Online Account" });
    }
    
    logActivity("User Registration", name, `Registered as ${role}`);
    res.json({ success: true, user: { name: account.name, email: account.email, role: account.role } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;
    const account = await Account.findOne({ email, password, role });
    if (account) {
      return res.json({ success: true, user: { name: account.name, email: account.email, role: account.role } });
    }
    const partial = await Account.findOne({ email, password });
    if (partial) {
      return res.status(401).json({ success: false, message: "This account is registered as " + partial.role + ", not " + role + "." });
    }
    res.status(401).json({ success: false, message: "Invalid email or password." });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ============ BOOKS (CRUD) ============

// GET all books
app.get("/api/books", async (req, res) => {
  try {
    const books = await Book.find().sort({ createdAt: -1 });
    res.json(books);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET single book details
app.get("/api/books/:id", async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ message: "Book not found." });

    const reviews = await Review.find({ bookId: book._id }).sort({ createdAt: -1 });
    const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : 0;
    const issueCount = await Transaction.countDocuments({ bookId: book._id });

    res.json({ ...book.toObject(), id: book._id, reviews, avgRating: parseFloat(avgRating), totalIssues: issueCount });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ADD book
app.post("/api/books", async (req, res) => {
  try {
    const { title, author, category, quantity, isbn, description, publisher, year } = req.body;
    if (!title || !author || !category || !quantity) {
      return res.status(400).json({ message: "Title, author, category & quantity are required." });
    }
    const newBook = await Book.create({
      title, author, category, isbn: isbn || "", description: description || "", publisher: publisher || "", year: year || null,
      totalCopies: parseInt(quantity), availableCopies: parseInt(quantity),
    });
    logActivity("Add Book", "System", `Added book "${newBook.title}" by ${newBook.author}`);
    res.json({ success: true, book: newBook });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// EDIT book
app.put("/api/books/:id", async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ message: "Book not found." });

    const { title, author, category, quantity, isbn, description, publisher, year } = req.body;
    const oldTotal = book.totalCopies;
    const newTotal = parseInt(quantity) || oldTotal;
    const diff = newTotal - oldTotal;

    book.title = title || book.title;
    book.author = author || book.author;
    book.category = category || book.category;
    book.isbn = isbn !== undefined ? isbn : book.isbn;
    book.description = description !== undefined ? description : book.description;
    book.publisher = publisher !== undefined ? publisher : book.publisher;
    book.year = year !== undefined ? year : book.year;
    book.totalCopies = newTotal;
    book.availableCopies = Math.max(0, book.availableCopies + diff);

    await book.save();
    logActivity("Edit Book", "System", `Updated details for "${book.title}"`);
    res.json({ success: true, book });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE book
app.delete("/api/books/:id", async (req, res) => {
  try {
    const hasActive = await Transaction.findOne({ bookId: req.params.id, status: "issued" });
    if (hasActive) return res.status(400).json({ message: "Cannot delete — book has active issues." });
    const book = await Book.findByIdAndDelete(req.params.id);
    if(book) logActivity("Delete Book", "System", `Deleted book "${book.title}"`);
    res.json({ success: true, title: book ? book.title : "" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ USERS (CRUD) ============

app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    const result = [];
    for (const u of users) {
      const issuedCount = await Transaction.countDocuments({ userId: u._id, status: "issued" });
      result.push({ ...u.toObject(), id: u._id, issuedCount });
    }
    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/users", async (req, res) => {
  try {
    const { name, contact } = req.body;
    if (!name || !contact) return res.status(400).json({ message: "All fields are required." });
    const newUser = await User.create({ name, contact });
    logActivity("Add Library User", "System", `Added user profile for ${newUser.name}`);
    res.json({ success: true, user: newUser });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    const hasUnreturned = await Transaction.findOne({ userId: req.params.id, status: "issued" });
    if (hasUnreturned) return res.status(400).json({ message: "Cannot delete — user has unreturned books." });
    const user = await User.findByIdAndDelete(req.params.id);
    if (user) logActivity("Delete User", "System", `Deleted user profile for ${user.name}`);
    res.json({ success: true, name: user ? user.name : "" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ TRANSACTIONS ============

app.get("/api/transactions", async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ createdAt: -1 });
    const enriched = [];
    for (const t of transactions) {
      const book = await Book.findById(t.bookId);
      enriched.push({ ...t.toObject(), id: t._id, bookTitle: book ? book.title : "Deleted" });
    }
    res.json(enriched);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ISSUE book
app.post("/api/transactions/issue", async (req, res) => {
  try {
    const { bookId, userId } = req.body;
    if (!bookId || !userId) return res.status(400).json({ message: "Book and user are required." });

    const book = await Book.findById(bookId);
    if (!book || book.availableCopies <= 0) return res.status(400).json({ message: "Book not available." });

    const user = await User.findById(userId);
    book.availableCopies--;
    await book.save();

    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 14);

    const transaction = await Transaction.create({
      bookId, userId, userName: user ? user.name : "Unknown",
      issueDate: now, dueDate, status: "issued",
    });

    // Create notification for the user
    if (user) {
      await Notification.create({
        userName: user.name, userEmail: "", type: "general",
        message: '"' + book.title + '" has been issued to you. Due: ' + dueDate.toLocaleDateString("en-IN"),
      });
    }
    
    logActivity("Issue Book", "System", `Issued "${book.title}" to ${user ? user.name : "Unknown"}`);

    res.json({ success: true, transaction, bookTitle: book.title, userName: user ? user.name : "Unknown", dueDate: dueDate.toISOString() });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// RETURN book
app.post("/api/transactions/return/:id", async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx || tx.status === "returned") return res.status(400).json({ message: "Already returned." });

    tx.status = "returned";
    tx.returnDate = new Date();
    await tx.save();

    const book = await Book.findById(tx.bookId);
    if (book) { book.availableCopies++; await book.save(); }

    let fine = 0;
    if (tx.returnDate > tx.dueDate) {
      fine = Math.ceil((tx.returnDate - tx.dueDate) / (1000 * 60 * 60 * 24)) * 5;
    }

    // Notify wishlist users that book is available
    if (book) {
      const wishlistEntries = await Wishlist.find({ bookId: book._id });
      for (const w of wishlistEntries) {
        await Notification.create({
          userName: w.userName, userEmail: w.userEmail, type: "available",
          message: '"' + book.title + '" is now available! You had it in your wishlist.',
        });
      }
    }
    
    logActivity("Return Book", "System", `Returned "${book ? book.title : "Unknown"}" (Fine: ₹${fine})`);

    res.json({ success: true, fine });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Borrowing History for a user
app.get("/api/transactions/history/:userName", async (req, res) => {
  try {
    const transactions = await Transaction.find({ userName: req.params.userName }).sort({ createdAt: -1 });
    const enriched = [];
    for (const t of transactions) {
      const book = await Book.findById(t.bookId);
      let fine = 0;
      const now = new Date();
      if (t.status === "returned" && t.returnDate > t.dueDate) {
        fine = Math.ceil((t.returnDate - t.dueDate) / (1000 * 60 * 60 * 24)) * 5;
      } else if (t.status === "issued" && now > t.dueDate) {
        fine = Math.ceil((now - t.dueDate) / (1000 * 60 * 60 * 24)) * 5;
      }
      enriched.push({ ...t.toObject(), id: t._id, bookTitle: book ? book.title : "Deleted", fine });
    }
    res.json(enriched);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ REQUESTS ============

app.get("/api/requests", async (req, res) => {
  try {
    const requests = await Request.find().sort({ createdAt: -1 });
    res.json(requests.map((r) => ({ ...r.toObject(), id: r._id })));
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
    if (!book || book.availableCopies <= 0) {
      request.status = "rejected"; await request.save();
      return res.status(400).json({ message: "Book no longer available." });
    }

    request.status = "approved"; await request.save();
    book.availableCopies--; await book.save();

    const now = new Date(); const dueDate = new Date(now); dueDate.setDate(dueDate.getDate() + 14);
    await Transaction.create({ bookId: request.bookId, userName: request.userName, issueDate: now, dueDate, status: "issued" });

    await Notification.create({
      userName: request.userName, userEmail: request.userEmail, type: "request_update",
      message: 'Your request for "' + request.bookTitle + '" has been approved!',
    });
    
    logActivity("Approve Request", "System", `Approved book request for "${request.bookTitle}" by ${request.userName}`);

    res.json({ success: true, bookTitle: request.bookTitle, userName: request.userName });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put("/api/requests/:id/reject", async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request || request.status !== "pending") return res.status(400).json({ message: "Request not found." });
    request.status = "rejected"; await request.save();

    await Notification.create({
      userName: request.userName, userEmail: request.userEmail, type: "request_update",
      message: 'Your request for "' + request.bookTitle + '" has been rejected.',
    });

    res.json({ success: true, userName: request.userName, bookTitle: request.bookTitle });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ REVIEWS & RATINGS ============

app.get("/api/reviews/:bookId", async (req, res) => {
  try {
    const reviews = await Review.find({ bookId: req.params.bookId }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/reviews", async (req, res) => {
  try {
    const { bookId, userName, userEmail, rating, comment } = req.body;
    if (!bookId || !userName || !rating) return res.status(400).json({ message: "Book, user and rating are required." });

    const existing = await Review.findOne({ bookId, userEmail });
    if (existing) {
      existing.rating = rating; existing.comment = comment || ""; await existing.save();
      return res.json({ success: true, review: existing, updated: true });
    }

    const review = await Review.create({ bookId, userName, userEmail, rating: parseInt(rating), comment: comment || "" });
    res.json({ success: true, review });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ WISHLIST ============

app.get("/api/wishlist/:userEmail", async (req, res) => {
  try {
    const items = await Wishlist.find({ userEmail: req.params.userEmail }).sort({ createdAt: -1 });
    const enriched = [];
    for (const w of items) {
      const book = await Book.findById(w.bookId);
      if (book) enriched.push({ ...w.toObject(), id: w._id, bookTitle: book.title, bookAuthor: book.author, availableCopies: book.availableCopies });
    }
    res.json(enriched);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/wishlist", async (req, res) => {
  try {
    const { bookId, userName, userEmail } = req.body;
    const exists = await Wishlist.findOne({ bookId, userEmail });
    if (exists) return res.status(400).json({ message: "Already in wishlist." });
    const item = await Wishlist.create({ bookId, userName, userEmail });
    res.json({ success: true, item });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.delete("/api/wishlist/:id", async (req, res) => {
  try {
    await Wishlist.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ NOTIFICATIONS ============

app.get("/api/notifications/:userEmail", async (req, res) => {
  try {
    const notifications = await Notification.find({ userEmail: req.params.userEmail }).sort({ createdAt: -1 }).limit(20);
    res.json(notifications.map((n) => ({ ...n.toObject(), id: n._id })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/notifications/user/:userName", async (req, res) => {
  try {
    const notifications = await Notification.find({ userName: req.params.userName }).sort({ createdAt: -1 }).limit(20);
    res.json(notifications.map((n) => ({ ...n.toObject(), id: n._id })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put("/api/notifications/:id/read", async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put("/api/notifications/read-all/:userName", async (req, res) => {
  try {
    await Notification.updateMany({ userName: req.params.userName }, { read: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ BOOK RECOMMENDATIONS ============

app.get("/api/recommendations/:userName", async (req, res) => {
  try {
    // Get user's borrowed categories
    const userTx = await Transaction.find({ userName: req.params.userName });
    const borrowedBookIds = userTx.map((t) => t.bookId);
    const borrowedBooks = await Book.find({ _id: { $in: borrowedBookIds } });
    const categories = [...new Set(borrowedBooks.map((b) => b.category))];

    let recommendations;
    if (categories.length > 0) {
      recommendations = await Book.find({ category: { $in: categories }, _id: { $nin: borrowedBookIds }, availableCopies: { $gt: 0 } }).limit(6);
    } else {
      // No history — recommend popular books
      const popular = await Transaction.aggregate([
        { $group: { _id: "$bookId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 }
      ]);
      const popularIds = popular.map((p) => p._id);
      recommendations = await Book.find({ _id: { $in: popularIds }, availableCopies: { $gt: 0 } });
    }

    if (recommendations.length === 0) {
      recommendations = await Book.find({ availableCopies: { $gt: 0 } }).limit(6);
    }

    res.json(recommendations);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ ACTIVITY LOGS ============

app.get("/api/activity", async (req, res) => {
  try {
    const logs = await ActivityLog.find().sort({ createdAt: -1 }).limit(50);
    res.json(logs);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ REPORTS & ANALYTICS (Admin) ============

app.get("/api/reports/overview", async (req, res) => {
  try {
    const totalBooks = await Book.countDocuments();
    const totalCopies = (await Book.find()).reduce((s, b) => s + b.totalCopies, 0);
    const totalUsers = await User.countDocuments();
    const totalTransactions = await Transaction.countDocuments();
    const activeIssues = await Transaction.countDocuments({ status: "issued" });
    const totalReturns = await Transaction.countDocuments({ status: "returned" });
    const pendingRequests = await Request.countDocuments({ status: "pending" });
    const totalReviews = await Review.countDocuments();

    // Total fines
    const now = new Date();
    const allTx = await Transaction.find();
    let totalFines = 0;
    let overdueCount = 0;
    allTx.forEach((t) => {
      if (t.status === "returned" && t.returnDate > t.dueDate) {
        totalFines += Math.ceil((t.returnDate - t.dueDate) / (1000 * 60 * 60 * 24)) * 5;
      } else if (t.status === "issued" && now > t.dueDate) {
        totalFines += Math.ceil((now - t.dueDate) / (1000 * 60 * 60 * 24)) * 5;
        overdueCount++;
      }
    });

    res.json({ totalBooks, totalCopies, totalUsers, totalTransactions, activeIssues, totalReturns, pendingRequests, totalReviews, totalFines, overdueCount });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Most borrowed books
app.get("/api/reports/popular-books", async (req, res) => {
  try {
    const result = await Transaction.aggregate([
      { $group: { _id: "$bookId", issueCount: { $sum: 1 } } },
      { $sort: { issueCount: -1 } },
      { $limit: 10 }
    ]);
    const enriched = [];
    for (const r of result) {
      const book = await Book.findById(r._id);
      if (book) enriched.push({ title: book.title, author: book.author, category: book.category, issueCount: r.issueCount });
    }
    res.json(enriched);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Most active users
app.get("/api/reports/active-users", async (req, res) => {
  try {
    const result = await Transaction.aggregate([
      { $group: { _id: "$userName", borrowCount: { $sum: 1 } } },
      { $sort: { borrowCount: -1 } },
      { $limit: 10 }
    ]);
    res.json(result.map((r) => ({ userName: r._id, borrowCount: r.borrowCount })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Category distribution
app.get("/api/reports/categories", async (req, res) => {
  try {
    const result = await Book.aggregate([
      { $group: { _id: "$category", count: { $sum: 1 }, totalCopies: { $sum: "$totalCopies" } } },
      { $sort: { count: -1 } }
    ]);
    res.json(result.map((r) => ({ category: r._id, bookCount: r.count, totalCopies: r.totalCopies })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Fine report
app.get("/api/reports/fines", async (req, res) => {
  try {
    const now = new Date();
    const allTx = await Transaction.find();
    const fineRecords = [];

    for (const t of allTx) {
      let fine = 0; let lateDays = 0;
      if (t.status === "returned" && t.returnDate > t.dueDate) {
        lateDays = Math.ceil((t.returnDate - t.dueDate) / (1000 * 60 * 60 * 24));
        fine = lateDays * 5;
      } else if (t.status === "issued" && now > t.dueDate) {
        lateDays = Math.ceil((now - t.dueDate) / (1000 * 60 * 60 * 24));
        fine = lateDays * 5;
      }
      if (fine > 0) {
        const book = await Book.findById(t.bookId);
        fineRecords.push({
          userName: t.userName, bookTitle: book ? book.title : "Deleted",
          issueDate: t.issueDate, dueDate: t.dueDate, returnDate: t.returnDate,
          status: t.status, lateDays, fine
        });
      }
    }

    const grandTotal = fineRecords.reduce((s, r) => s + r.fine, 0);
    res.json({ records: fineRecords, grandTotal });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ DASHBOARD STATS ============
app.get("/api/stats", async (req, res) => {
  try {
    const { role, name } = req.query;
    const books = await Book.find();
    const totalBooks = books.reduce((sum, b) => sum + b.totalCopies, 0);
    const totalUsers = await User.countDocuments();

    let txQuery = {};
    if (role === "student" && name) txQuery.userName = name;

    const transactions = await Transaction.find(txQuery);
    const issuedBooks = transactions.filter((t) => t.status === "issued").length;

    let totalFines = 0;
    const now = new Date();
    transactions.forEach((t) => {
      if (t.status === "returned" && t.returnDate > t.dueDate) {
        totalFines += Math.ceil((t.returnDate - t.dueDate) / (1000 * 60 * 60 * 24)) * 5;
      } else if (t.status === "issued" && now > t.dueDate) {
        totalFines += Math.ceil((now - t.dueDate) / (1000 * 60 * 60 * 24)) * 5;
      }
    });

    const recentTx = transactions.slice(-5).reverse();
    const recent = [];
    for (const t of recentTx) {
      const book = await Book.findById(t.bookId);
      recent.push({ ...t.toObject(), id: t._id, bookTitle: book ? book.title : "Deleted" });
    }

    const pendingRequests = await Request.countDocuments({ status: "pending" });
    res.json({ totalBooks, totalUsers, issuedBooks, totalFines, recent, pendingRequests });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ DROPDOWN DATA ============
app.get("/api/dropdowns", async (req, res) => {
  try {
    const availableBooks = await Book.find({ availableCopies: { $gt: 0 } });
    const users = await User.find();
    res.json({
      books: availableBooks.map((b) => ({ id: b._id, label: b.title + " by " + b.author + " (" + b.availableCopies + " left)" })),
      users: users.map((u) => ({ id: u._id, label: u.name })),
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ DIGITAL LIBRARY (eBooks) ============

app.get("/api/ebooks", async (req, res) => {
  try {
    const ebooks = await EBook.find().sort({ createdAt: -1 });
    res.json(ebooks.map((e) => ({ ...e.toObject(), id: e._id })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/api/ebooks/:id", async (req, res) => {
  try {
    const ebook = await EBook.findById(req.params.id);
    if (!ebook) return res.status(404).json({ message: "eBook not found." });
    res.json({ ...ebook.toObject(), id: ebook._id });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/api/ebooks", async (req, res) => {
  try {
    const { title, author, category, description, pdfUrl, pages, language } = req.body;
    if (!title || !author || !pdfUrl) return res.status(400).json({ message: "Title, author and PDF URL are required." });
    const ebook = await EBook.create({ title, author, category: category || "General", description: description || "", pdfUrl, pages: pages || 0, language: language || "English" });
    res.json({ success: true, ebook });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.delete("/api/ebooks/:id", async (req, res) => {
  try {
    const ebook = await EBook.findByIdAndDelete(req.params.id);
    res.json({ success: true, title: ebook ? ebook.title : "" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ CATCH-ALL ============
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

// ============ START ============
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("");
  console.log("  ╔══════════════════════════════════════╗");
  console.log("  ║   BookSphere Server Running          ║");
  console.log("  ║   http://localhost:" + PORT + "               ║");
  console.log("  ║   Database: MongoDB                  ║");
  console.log("  ╚══════════════════════════════════════╝");
  console.log("");
});
