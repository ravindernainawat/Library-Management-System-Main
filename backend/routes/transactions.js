const express = require("express");
const router = express.Router();
const Book = require("../models/Book");
const BookCopy = require("../models/BookCopy");
const User = require("../models/User");
const Account = require("../models/Account");
const Transaction = require("../models/Transaction");
const Notification = require("../models/Notification");
const Reservation = require("../models/Reservation");
const Wishlist = require("../models/Wishlist");
const { logActivity, notifyReservationQueue, calcFine } = require("../utils");
const { verifyAdmin } = require("../middleware/auth");
// Issue limits by role
const ISSUE_LIMITS = { student: 3, teacher: 5, admin: 10, owner: 10 };
const DUE_DAYS    = { student: 14, teacher: 30, admin: 30, owner: 30 };

// GET all transactions — paginated
router.get("/", verifyAdmin, async (req, res) => {
  try {
    let page  = Math.max(1, parseInt(req.query.page)  || 1);
    let limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    // Build filter
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      filter.userName = { $regex: req.query.search, $options: "i" };
    }

    const totalRecords = await Transaction.countDocuments(filter);
    const totalPages   = Math.ceil(totalRecords / limit) || 1;
    page = Math.min(page, totalPages);
    const skip = (page - 1) * limit;

    const txs = await Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const enriched = [];
    for (const t of txs) {
      const book = await Book.findById(t.bookId);
      const fine = calcFine(t);
      enriched.push({ ...t.toObject(), id: t._id, bookTitle: book ? book.title : "Deleted", fine });
    }

    res.json({
      success: true,
      data: enriched,
      pagination: {
        page, limit, totalRecords, totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET history for a user — paginated
router.get("/history/:userName", async (req, res) => {
  try {
    // Authorization Check
    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.name !== req.params.userName) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only view your own history." });
    }
    let page  = Math.max(1, parseInt(req.query.page)  || 1);
    let limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const totalRecords = await Transaction.countDocuments({ userName: req.params.userName });
    const totalPages   = Math.ceil(totalRecords / limit) || 1;
    page = Math.min(page, totalPages);
    const skip = (page - 1) * limit;

    const txs = await Transaction.find({ userName: req.params.userName }).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const enriched = [];
    for (const t of txs) {
      const book = await Book.findById(t.bookId);
      const fine = calcFine(t);
      enriched.push({ ...t.toObject(), id: t._id, bookTitle: book ? book.title : "Deleted", fine });
    }

    res.json({
      success: true,
      data: enriched,
      pagination: {
        page, limit, totalRecords, totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ISSUE book (manual)
router.post("/issue", verifyAdmin, async (req, res) => {
  try {
    const { bookId, userId, issuedBy } = req.body;
    if (!bookId || !userId) return res.status(400).json({ message: "Book and user required." });

    const book = await Book.findById(bookId);
    if (!book || book.availableCopies <= 0) return res.status(400).json({ message: "Book not available." });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    // Check if user is blocked
    const account = await Account.findOne({ email: user.contact });
    if (account && account.status === "blocked") return res.status(403).json({ message: `User is blocked: ${account.blockedReason}` });

    const userRole = user.role || "student";
    const limit = ISSUE_LIMITS[userRole] || 3;

    // Check issue limit
    const activeCount = await Transaction.countDocuments({ userId: user._id, status: "issued" });
    if (activeCount >= limit) return res.status(400).json({ message: `User has reached the ${userRole} issue limit (${limit} books).` });

    // Find an available copy
    const copy = await BookCopy.findOne({ bookId, status: "available" });

    const now = new Date();
    const dueDays = DUE_DAYS[userRole] || 14;
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + dueDays);

    book.availableCopies--;
    await book.save();

    if (copy) { copy.status = "issued"; copy.currentIssuedTo = user.name; await copy.save(); }

    const tx = await Transaction.create({
      bookId, userId: user._id, copyId: copy ? copy._id : null,
      userName: user.name, userRole, issueDate: now, dueDate, status: "issued", issuedVia: "manual"
    });
    if (copy) { copy.currentTransactionId = tx._id; await copy.save(); }

    if (account) {
      account.points = (account.points || 0) + 10;
      const lastBorrow = account.lastBorrowDate ? new Date(account.lastBorrowDate) : null;
      if (lastBorrow) {
        const diffDays = Math.floor((now - lastBorrow) / (1000 * 60 * 60 * 24));
        if (diffDays <= 7) account.readingStreak = (account.readingStreak || 0) + 1;
        else account.readingStreak = 1;
      } else {
        account.readingStreak = 1;
      }
      account.lastBorrowDate = now;
      await account.save();
    }

    await Notification.create({ userName: user.name, userEmail: user.contact, type: "general", message: `"${book.title}" issued to you. Due: ${dueDate.toLocaleDateString("en-IN")} (${dueDays} days).` });
    logActivity("Issue Book", issuedBy || "Admin", `Issued "${book.title}" to ${user.name} (due ${dueDays} days)`);

    res.json({ success: true, transaction: tx, bookTitle: book.title, userName: user.name, dueDate: dueDate.toISOString() });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ISSUE by QR scan
router.post("/issue-qr", verifyAdmin, async (req, res) => {
  try {
    const { qrData, userId, issuedBy } = req.body;
    if (!qrData || !userId) return res.status(400).json({ message: "QR data and user required." });

    const copy = await BookCopy.findOne({ qrData });
    if (!copy) return res.status(404).json({ message: "QR code not recognized." });
    if (copy.status !== "available") return res.status(400).json({ message: `Copy is currently ${copy.status}.` });

    req.body.bookId = copy.bookId.toString();
    req.body.issuedVia = "qr";

    const book = await Book.findById(copy.bookId);
    if (!book || book.availableCopies <= 0) return res.status(400).json({ message: "Book not available." });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    const account = await Account.findOne({ email: user.contact });
    if (account && account.status === "blocked") return res.status(403).json({ message: `User is blocked: ${account.blockedReason}` });

    const userRole = user.role || "student";
    const limit = ISSUE_LIMITS[userRole] || 3;
    const activeCount = await Transaction.countDocuments({ userId: user._id, status: "issued" });
    if (activeCount >= limit) return res.status(400).json({ message: `User has reached issue limit (${limit} books).` });

    const now = new Date();
    const dueDays = DUE_DAYS[userRole] || 14;
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + dueDays);

    book.availableCopies--;
    await book.save();
    copy.status = "issued";
    copy.currentIssuedTo = user.name;
    await copy.save();

    const tx = await Transaction.create({
      bookId: book._id, userId: user._id, copyId: copy._id,
      userName: user.name, userRole, issueDate: now, dueDate, status: "issued", issuedVia: "qr"
    });
    copy.currentTransactionId = tx._id;
    await copy.save();

    if (account) {
      account.points = (account.points || 0) + 10;
      const lastBorrow = account.lastBorrowDate ? new Date(account.lastBorrowDate) : null;
      if (lastBorrow) {
        const diffDays = Math.floor((now - lastBorrow) / (1000 * 60 * 60 * 24));
        if (diffDays <= 7) account.readingStreak = (account.readingStreak || 0) + 1;
        else account.readingStreak = 1;
      } else {
        account.readingStreak = 1;
      }
      account.lastBorrowDate = now;
      await account.save();
    }

    await Notification.create({ userName: user.name, userEmail: user.contact, type: "general", message: `"${book.title}" (Copy #${copy.copyNumber}) issued via QR. Due: ${dueDate.toLocaleDateString("en-IN")}.` });
    logActivity("Issue Book (QR)", issuedBy || "Admin", `QR issued "${book.title}" Copy #${copy.copyNumber} to ${user.name}`);

    res.json({ success: true, bookTitle: book.title, copyNumber: copy.copyNumber, userName: user.name, dueDate: dueDate.toISOString() });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// RETURN book
router.post("/return/:id", verifyAdmin, async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx || tx.status === "returned") return res.status(400).json({ message: "Already returned." });

    tx.status = "returned";
    tx.returnDate = new Date();

    // Calculate overdue fine
    let overdueFine = 0;
    if (tx.returnDate > tx.dueDate) {
      overdueFine = Math.ceil((tx.returnDate - tx.dueDate) / (1000 * 60 * 60 * 24)) * 5;
    }
    tx.overdueFine = overdueFine;
    tx.totalFine = overdueFine + (tx.damageFine || 0);
    if (tx.totalFine > 0) tx.fineStatus = "unpaid";
    await tx.save();

    const user = await User.findById(tx.userId);
    if (user) {
      const account = await Account.findOne({ email: user.contact });
      if (account && overdueFine === 0) {
        account.points = (account.points || 0) + 5;
        await account.save();
      }
    }

    const book = await Book.findById(tx.bookId);
    if (book) { book.availableCopies++; await book.save(); }

    // Update copy status
    if (tx.copyId) {
      await BookCopy.findByIdAndUpdate(tx.copyId, { status: "available", currentIssuedTo: "", currentTransactionId: null });
    }

    // Notify reservation queue
    if (book) await notifyReservationQueue(book, Reservation, Notification);

    // Notify wishlist users
    if (book) {
      const wItems = await Wishlist.find({ bookId: book._id });
      for (const w of wItems) {
        await Notification.create({ userName: w.userName, userEmail: w.userEmail, type: "available", message: `"${book.title}" is now available! You had it in your wishlist.` });
      }
    }

    logActivity("Return Book", "Admin", `Returned "${book ? book.title : "?"}" (Overdue fine: ₹${overdueFine})`);
    res.json({ success: true, overdueFine, totalFine: tx.totalFine });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// RETURN by QR scan
router.post("/return-qr", verifyAdmin, async (req, res) => {
  try {
    const { qrData } = req.body;
    if (!qrData) return res.status(400).json({ message: "QR data required." });
    const copy = await BookCopy.findOne({ qrData });
    if (!copy) return res.status(404).json({ message: "QR code not recognized." });
    if (copy.status !== "issued") return res.status(400).json({ message: "This copy is not currently issued." });
    const tx = await Transaction.findOne({ copyId: copy._id, status: "issued" });
    if (!tx) return res.status(404).json({ message: "No active transaction for this copy." });
    // Reuse return logic
    req.params = { id: tx._id.toString() };
    // Inline return
    tx.status = "returned";
    tx.returnDate = new Date();
    let overdueFine = tx.returnDate > tx.dueDate ? Math.ceil((tx.returnDate - tx.dueDate) / (1000 * 60 * 60 * 24)) * 5 : 0;
    tx.overdueFine = overdueFine;
    tx.totalFine = overdueFine + (tx.damageFine || 0);
    if (tx.totalFine > 0) tx.fineStatus = "unpaid";
    await tx.save();

    const userQr = await User.findById(tx.userId);
    if (userQr) {
      const accountQr = await Account.findOne({ email: userQr.contact });
      if (accountQr && overdueFine === 0) {
        accountQr.points = (accountQr.points || 0) + 5;
        await accountQr.save();
      }
    }
    const book = await Book.findById(tx.bookId);
    if (book) { book.availableCopies++; await book.save(); }
    copy.status = "available"; copy.currentIssuedTo = ""; copy.currentTransactionId = null;
    await copy.save();
    if (book) await notifyReservationQueue(book, Reservation, Notification);
    logActivity("Return Book (QR)", "Admin", `QR returned "${book ? book.title : "?"}" Copy #${copy.copyNumber}`);
    res.json({ success: true, bookTitle: book ? book.title : "?", copyNumber: copy.copyNumber, overdueFine, totalFine: tx.totalFine });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ADD damage fine to transaction
router.put("/:id/damage-fine", verifyAdmin, async (req, res) => {
  try {
    const { damageFine, damageNotes, addedBy } = req.body;
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ message: "Transaction not found." });
    tx.damageFine = parseInt(damageFine) || 0;
    tx.damageNotes = damageNotes || "";
    tx.totalFine = (tx.overdueFine || 0) + tx.damageFine;
    if (tx.totalFine > 0) tx.fineStatus = "unpaid";
    await tx.save();
    logActivity("Damage Fine", addedBy || "Admin", `Added ₹${tx.damageFine} damage fine: ${damageNotes}`);
    res.json({ success: true, totalFine: tx.totalFine });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// RECORD PAYMENT
router.put("/:id/pay", verifyAdmin, async (req, res) => {
  try {
    const { paymentMethod, paidBy } = req.body;
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ message: "Transaction not found." });
    tx.fineStatus = "paid";
    tx.paymentMethod = paymentMethod || "cash";
    tx.paymentDate = new Date();
    await tx.save();
    logActivity("Fine Payment", paidBy || "Admin", `Fine ₹${tx.totalFine} paid via ${paymentMethod}`);
    res.json({ success: true, totalFine: tx.totalFine, paymentMethod: tx.paymentMethod });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// STUDENT MOCK ONLINE PAYMENT
router.post("/pay-fine/:id", async (req, res) => {
  try {
    const { amount } = req.body;
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ success: false, message: "Transaction not found." });
    
    // Authorization Check: Student can only pay their own fine; Admin/Owner can pay anyone's fine.
    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.name !== tx.userName) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only pay your own fines." });
    }
    
    tx.fineStatus = "paid";
    tx.paymentMethod = "online";
    tx.paymentDate = new Date();
    await tx.save();
    
    logActivity("Online Payment", tx.userName, `Fine ₹${amount} paid online via Stripe mock`);
    res.json({ success: true, message: "Payment successful" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// RENEW book
router.put("/:id/renew", async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ success: false, message: "Transaction not found." });
    
    // Authorization Check: Student can only renew their own issue; Admin/Owner can renew anyone's.
    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.name !== tx.userName) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only renew your own active issues." });
    }
    if (tx.status !== "issued") return res.status(400).json({ success: false, message: "Only active issues can be renewed." });
    
    const now = new Date();
    if (now > tx.dueDate) return res.status(400).json({ success: false, message: "Cannot renew an overdue book." });
    if (tx.renewed) return res.status(400).json({ success: false, message: "Book has already been renewed once." });
    
    const newDueDate = new Date(tx.dueDate);
    newDueDate.setDate(newDueDate.getDate() + 14);
    tx.dueDate = newDueDate;
    tx.renewed = true;
    await tx.save();
    
    logActivity("Renew Book", tx.userName, `Renewed "${tx.bookTitle || 'Book'}" for 14 days`);
    res.json({ success: true, message: "Book renewed successfully. Due date extended by 14 days.", dueDate: tx.dueDate });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
