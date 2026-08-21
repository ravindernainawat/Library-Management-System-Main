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
const PDFDocument = require("pdfkit");
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
    // Authorization Check — use email for reliable identity matching
    const isAdminOrOwner = req.user.role === "admin" || req.user.role === "owner";
    if (!isAdminOrOwner && req.user.name !== req.params.userName) {
      // Double-check via email: find the User record and compare
      const targetUser = await User.findOne({ name: req.params.userName });
      if (!targetUser || targetUser.contact !== req.user.email) {
        return res.status(403).json({ success: false, message: "Forbidden. You can only view your own history." });
      }
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

// GET UNPAID FINES
router.get("/fines/unpaid", async (req, res) => {
  try {
    // Include both truly unpaid AND pending-verification fines for students
    const filter = { $or: [{ fineStatus: "unpaid" }, { fineStatus: "unpaid", paymentStatus: "pending" }] };
    if (req.user.role !== "admin" && req.user.role !== "owner") {
      // Use email-based lookup for reliable identity matching
      const userRecord = await User.findOne({ contact: req.user.email });
      if (userRecord) {
        filter.userId = userRecord._id;
      } else {
        filter.userName = req.user.name;
      }
    }
    const txs = await Transaction.find(filter).sort({ createdAt: -1 });
    const enriched = [];
    for (const t of txs) {
      const book = await Book.findById(t.bookId);
      const fine = calcFine(t);
      enriched.push({ ...t.toObject(), id: t._id, bookTitle: book ? book.title : "Deleted", fine });
    }
    res.json({ success: true, data: enriched });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET FINE PAYMENT HISTORY
router.get("/fines/history", async (req, res) => {
  try {
    const filter = {};
    if (req.user.role !== "admin" && req.user.role !== "owner") {
      // Use email-based lookup for reliable identity matching
      const userRecord = await User.findOne({ contact: req.user.email });
      if (userRecord) {
        filter.userId = userRecord._id;
      } else {
        filter.userName = req.user.name;
      }
    }

    // Status filter
    if (req.query.status && req.query.status !== "all") {
      if (req.query.status === "paid") {
        filter.fineStatus = "paid";
      } else if (req.query.status === "pending") {
        filter.fineStatus = "unpaid";
      }
    } else {
      // By default show all transactions that have a fine
      filter.$or = [
        { fineStatus: { $in: ["unpaid", "paid"] } },
        { overdueFine: { $gt: 0 } },
        { damageFine: { $gt: 0 } },
        { totalFine: { $gt: 0 } }
      ];
    }
    
    // Method filter
    if (req.query.method && req.query.method !== "all") {
      filter.paymentMethod = req.query.method;
    }
    
    const txs = await Transaction.find(filter).sort({ paymentDate: -1, updatedAt: -1 });
    const enriched = [];
    for (const t of txs) {
      const book = await Book.findById(t.bookId);
      const fine = calcFine(t);
      enriched.push({ ...t.toObject(), id: t._id, bookTitle: book ? book.title : "Deleted", fine });
    }
    res.json({ success: true, data: enriched });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// RECORD PAYMENT (ADMIN PUT DIRECT PAYMENT)
router.put("/:id/pay", verifyAdmin, async (req, res) => {
  try {
    const { paymentMethod, paidBy } = req.body;
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ message: "Transaction not found." });

    if (tx.fineStatus === "paid") {
      return res.status(400).json({ message: "Fine already paid." });
    }

    if (!["cash", "upi", "card", "net_banking"].includes(paymentMethod)) {
      return res.status(400).json({ message: "Invalid payment method." });
    }

    const fineAmount = tx.totalFine || calcFine(tx);
    if (fineAmount <= 0) {
      return res.status(400).json({ message: "No outstanding fine for this transaction." });
    }

    // Update Transaction
    tx.fineStatus = "paid";
    tx.paymentStatus = "completed";
    tx.paymentMethod = paymentMethod;
    tx.paymentDate = new Date();
    tx.transactionId = paymentMethod === "cash" 
      ? "CASH-" + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase()
      : "TXN-" + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
    tx.verified = true;
    tx.verifiedBy = req.user.id;
    tx.verifiedAt = new Date();
    tx.receiptNumber = "RCPT-" + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
    await tx.save();

    // Create Notification for student
    await Notification.create({
      userName: tx.userName,
      userEmail: "",
      type: "general",
      message: `Fine of ₹${fineAmount} has been marked as PAID via ${paymentMethod.toUpperCase()} by Admin. Receipt: ${tx.receiptNumber}`
    });

    logActivity("Fine Payment", paidBy || "Admin", `Fine ₹${fineAmount} paid via ${paymentMethod} (Direct/Cash)`);
    res.json({ success: true, totalFine: tx.totalFine, paymentMethod: tx.paymentMethod, receiptNumber: tx.receiptNumber });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// STUDENT PAYMENT SUBMISSION
router.post("/pay-fine/:id", async (req, res) => {
  try {
    const { amount, paymentMethod } = req.body;
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ success: false, message: "Transaction not found." });
    
    // Authorization Check: Use email/userId for reliable identity matching
    const isAdminOrOwner = req.user.role === "admin" || req.user.role === "owner";
    if (!isAdminOrOwner) {
      const userRecord = await User.findOne({ contact: req.user.email });
      if (!userRecord || !tx.userId || userRecord._id.toString() !== tx.userId.toString()) {
        return res.status(403).json({ success: false, message: "Forbidden. You can only pay your own fines." });
      }
    }

    if (tx.fineStatus === "paid") {
      return res.status(400).json({ success: false, message: "Fine already paid." });
    }

    // Block duplicate payment submissions (already pending verification)
    if (tx.paymentStatus === "pending") {
      return res.status(400).json({ success: false, message: "Payment already submitted and pending verification." });
    }

    const fineAmount = tx.totalFine || calcFine(tx);
    if (fineAmount <= 0) {
      return res.status(400).json({ success: false, message: "No outstanding fine for this transaction." });
    }

    // Verify submitted amount matches the actual fine
    if (amount && parseInt(amount) !== fineAmount) {
      return res.status(400).json({ success: false, message: `Payment amount mismatch. Expected ₹${fineAmount}.` });
    }

    // Student cannot pay via Cash
    if (!isAdminOrOwner && paymentMethod === "cash") {
      return res.status(400).json({ success: false, message: "Students cannot pay fines using Cash. Please choose UPI, Card, or Net Banking." });
    }

    if (!["upi", "card", "net_banking", "online"].includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: "Invalid payment method." });
    }

    // CRITICAL: fineStatus stays "unpaid" until admin verifies; paymentStatus goes to "pending"
    tx.fineStatus = "unpaid";
    tx.paymentStatus = "pending";
    tx.paymentMethod = paymentMethod;
    tx.paymentDate = new Date();
    tx.transactionId = "TXN-" + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
    tx.verified = false;
    tx.receiptNumber = "RCPT-" + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
    await tx.save();

    // Notify Student
    await Notification.create({
      userName: tx.userName,
      userEmail: "",
      type: "general",
      message: `Fine payment of ₹${fineAmount} submitted via ${paymentMethod.toUpperCase()}. Transaction ID: ${tx.transactionId}. Pending admin verification.`
    });

    // Notify Admin/Owner
    await Notification.create({
      userName: "Admin",
      userEmail: "",
      type: "admin_approval",
      message: `Fine payment of ₹${fineAmount} submitted by ${tx.userName} via ${paymentMethod.toUpperCase()}. Pending verification.`
    });

    logActivity("Online Payment", tx.userName, `Fine ₹${fineAmount} submitted online via ${paymentMethod} — pending verification`);
    res.json({ success: true, message: "Payment submitted! Pending admin verification.", data: tx });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ADMIN VERIFICATION OF PAYMENT
router.put("/verify-fine/:id", verifyAdmin, async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ success: false, message: "Transaction not found." });

    // Check the payment is in the correct state for verification
    if (tx.paymentStatus !== "pending") {
      return res.status(400).json({ success: false, message: "No pending payment to verify for this transaction." });
    }

    if (tx.verified) {
      return res.status(400).json({ success: false, message: "Payment already verified." });
    }

    // Prevent self-verification: admin cannot verify a fine belonging to their own account
    if (tx.userId && tx.userId.toString() === req.user.id) {
      return res.status(403).json({ success: false, message: "You cannot verify your own fine payment." });
    }

    // CRITICAL: NOW transition fineStatus to "paid" and paymentStatus to "completed"
    tx.fineStatus = "paid";
    tx.paymentStatus = "completed";
    tx.verified = true;
    tx.verifiedBy = req.user.id;
    tx.verifiedAt = new Date();
    await tx.save();

    // Notify Student
    await Notification.create({
      userName: tx.userName,
      userEmail: "",
      type: "general",
      message: `Your fine payment of ₹${tx.totalFine || tx.overdueFine} has been verified by the administrator. Receipt Number: ${tx.receiptNumber}.`
    });

    logActivity("Verify Fine Payment", req.user.name, `Verified payment of ₹${tx.totalFine} for user ${tx.userName}`);
    res.json({ success: true, message: "Payment verified successfully.", data: tx });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET RECEIPT PDF
router.get("/receipt/:id", async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ success: false, message: "Transaction not found." });

    // Receipt requires verified payment
    if (tx.fineStatus !== "paid" || !tx.verified) {
      return res.status(400).json({ success: false, message: "Receipt can only be generated for verified and paid fines." });
    }

    // Auth Check: Use email/userId for reliable identity matching
    const isAdminOrOwner = req.user.role === "admin" || req.user.role === "owner";
    if (!isAdminOrOwner) {
      const userRecord = await User.findOne({ contact: req.user.email });
      if (!userRecord || !tx.userId || userRecord._id.toString() !== tx.userId.toString()) {
        return res.status(403).json({ success: false, message: "Forbidden. You can only view your own receipts." });
      }
    }

    const book = await Book.findById(tx.bookId);
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Receipt-${tx.receiptNumber || tx._id}.pdf`);
    doc.pipe(res);

    // PDF styling and presentation
    doc.fillColor("#3b82f6").fontSize(26).text("BookSphere", { align: "center" });
    doc.fillColor("#666666").fontSize(10).text("Advance Library Management System", { align: "center" });
    doc.moveDown(1.5);

    doc.strokeColor("#dddddd").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1.5);

    doc.fillColor("#222222").fontSize(18).text("FINE PAYMENT RECEIPT", { align: "center" });
    doc.moveDown(1.5);

    doc.fontSize(11);
    const leftMargin = 70;
    
    doc.text(`Receipt Number:   ${tx.receiptNumber || "N/A"}`, leftMargin, doc.y);
    doc.text(`Transaction ID:   ${tx.transactionId || "N/A"}`);
    doc.text(`Payment Date:     ${tx.paymentDate ? new Date(tx.paymentDate).toLocaleString("en-IN") : "N/A"}`);
    doc.text(`Payment Method:   ${tx.paymentMethod.toUpperCase()}`);
    
    doc.text(`Status:           `, { continued: true });
    doc.fillColor(tx.verified ? "#10B981" : "#F59E0B").text(`${tx.verified ? "VERIFIED" : "PENDING VERIFICATION"}`);
    doc.fillColor("#222222"); // reset color

    doc.moveDown(2);
    doc.fontSize(13).text("Transaction Details", { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(11);
    doc.text(`Student Name:     ${tx.userName}`);
    doc.text(`Book Title:       ${book ? book.title : "Deleted Book"}`);
    doc.text(`Due Date:         ${new Date(tx.dueDate).toLocaleDateString("en-IN")}`);
    
    if (tx.returnDate) {
      doc.text(`Return Date:      ${new Date(tx.returnDate).toLocaleDateString("en-IN")}`);
    }

    doc.moveDown(1);
    doc.text(`Overdue Fine:     Rs. ${tx.overdueFine || 0}`);
    doc.text(`Damage Fine:      Rs. ${tx.damageFine || 0}`);
    if (tx.damageNotes) {
      doc.text(`Damage Notes:     ${tx.damageNotes}`);
    }
    
    doc.moveDown(1);
    doc.fontSize(13).text(`Total Paid:       Rs. ${tx.totalFine || 0}`, { font: "Helvetica-Bold", color: "#EF4444" });
    doc.fontSize(11).font("Helvetica").fillColor("#222222");

    if (tx.verified) {
      doc.moveDown(1.5);
      doc.strokeColor("#dddddd").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1.5);

      const verifier = await Account.findById(tx.verifiedBy);
      doc.text(`Verified By:      ${verifier ? verifier.name : "System Administrator"}`);
      doc.text(`Verified At:      ${tx.verifiedAt ? new Date(tx.verifiedAt).toLocaleString("en-IN") : "N/A"}`);
    }

    doc.moveDown(4);
    doc.fontSize(9).fillColor("#999999").text("This is a computer-generated document and does not require a physical signature.", { align: "center", italic: true });

    doc.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// RENEW book
router.put("/:id/renew", async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ success: false, message: "Transaction not found." });
    
    // Authorization Check: Use email/userId for reliable identity matching
    const isAdminOrOwner = req.user.role === "admin" || req.user.role === "owner";
    if (!isAdminOrOwner) {
      const userRecord = await User.findOne({ contact: req.user.email });
      if (!userRecord || !tx.userId || userRecord._id.toString() !== tx.userId.toString()) {
        return res.status(403).json({ success: false, message: "Forbidden. You can only renew your own active issues." });
      }
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
