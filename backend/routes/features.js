const express = require("express");
const router = express.Router();
const Book = require("../models/Book");
const Transaction = require("../models/Transaction");
const Reservation = require("../models/Reservation");
const Exchange = require("../models/Exchange");
const Notification = require("../models/Notification");
const User = require("../models/User");
const Account = require("../models/Account");
const BookCopy = require("../models/BookCopy");
const { logActivity, calcFine } = require("../utils");
const { verifyAdmin } = require("../middleware/auth");
const PDFDocument = require("pdfkit");

// ============ RESERVATIONS (24-hour hold) ============

// Reserve an available book — holds 1 copy for 24 hours
router.post("/reservations", async (req, res) => {
  try {
    const { bookId, userName, userEmail } = req.body;
    if (!bookId || !userName) return res.status(400).json({ message: "Book and user required." });
    
    // Authorization Check: Student can only reserve books for themselves; Admin/Owner can reserve for anyone.
    if (req.user.role !== "admin" && req.user.role !== "owner" && (req.user.name !== userName || (userEmail && req.user.email !== userEmail))) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only reserve books for yourself." });
    }

    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ message: "Book not found." });

    // Check if user already has an active reservation for this book
    const existing = await Reservation.findOne({ bookId, userName, status: "waiting" });
    if (existing) return res.status(400).json({ message: "You already have an active reservation for this book." });

    // Book must have available copies
    if (book.availableCopies <= 0) return res.status(400).json({ message: "No copies available to reserve." });

    // Set expiry to 24 hours from now
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Decrease available copies (hold 1 copy)
    book.availableCopies -= 1;
    await book.save();

    const reservation = await Reservation.create({
      bookId, bookTitle: book.title, userName, userEmail: userEmail || "",
      position: 1, status: "waiting", expiresAt
    });

    await Notification.create({
      userName, userEmail: userEmail || "", type: "general",
      message: `You reserved "${book.title}". Please collect it within 24 hours (by ${expiresAt.toLocaleString("en-IN")}), or it will be auto-released.`
    });
    logActivity("Reserve Book", userName, `Reserved "${book.title}" — expires ${expiresAt.toLocaleString("en-IN")}`);
    res.json({ success: true, reservation: { ...reservation.toObject(), id: reservation._id }, expiresAt });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Get user's reservations — paginated
router.get("/reservations/user/:userName", async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.name !== req.params.userName) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only view your own reservations." });
    }
    // Auto-expire any past-due reservations first
    await expireOldReservations();

    let page  = Math.max(1, parseInt(req.query.page)  || 1);
    let limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const filter = { userName: req.params.userName };
    const totalRecords = await Reservation.countDocuments(filter);
    const totalPages   = Math.ceil(totalRecords / limit) || 1;
    page = Math.min(page, totalPages);
    const skip = (page - 1) * limit;

    const reservations = await Reservation.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
    res.json({
      success: true,
      data: reservations.map(r => ({ ...r.toObject(), id: r._id })),
      pagination: { page, limit, totalRecords, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 }
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Cancel reservation — restores the held copy
router.delete("/reservations/:id", async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id);
    if (!reservation) return res.status(404).json({ message: "Reservation not found." });
    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.name !== reservation.userName) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only cancel your own reservations." });
    }
    if (reservation.status !== "waiting") return res.status(400).json({ message: "Reservation is already " + reservation.status + "." });

    reservation.status = "cancelled";
    await reservation.save();

    // Restore the held copy
    await Book.findByIdAndUpdate(reservation.bookId, { $inc: { availableCopies: 1 } });

    logActivity("Cancel Reservation", reservation.userName, `Cancelled reservation for "${reservation.bookTitle}"`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Auto-expire reservations older than 24 hours
async function expireOldReservations() {
  const now = new Date();
  const expired = await Reservation.find({ status: "waiting", expiresAt: { $lte: now } });
  for (const r of expired) {
    r.status = "expired";
    await r.save();
    // Restore the held copy
    await Book.findByIdAndUpdate(r.bookId, { $inc: { availableCopies: 1 } });
    await Notification.create({
      userName: r.userName, userEmail: r.userEmail, type: "general",
      message: `Your reservation for "${r.bookTitle}" has expired (24 hours passed). The book is now available for others.`
    });
    logActivity("Reservation Expired", r.userName, `Reservation for "${r.bookTitle}" auto-expired`);
  }
}

// ============ EXCHANGES ============

// Send exchange request
router.post("/exchanges", async (req, res) => {
  try {
    const { fromUser, fromUserEmail, toUser, toUserEmail, bookId, bookTitle, campusLocation, message } = req.body;
    if (!fromUser || !toUser || !bookId) return res.status(400).json({ message: "From user, to user, and book required." });

    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.name !== fromUser) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only initiate exchanges from your own account." });
    }

    const existing = await Exchange.findOne({ fromUser, bookId, status: { $in: ["pending","accepted"] } });
    if (existing) return res.status(400).json({ message: "You already have an active exchange request for this book." });

    const exchange = await Exchange.create({ fromUser, fromUserEmail: fromUserEmail||"", toUser, toUserEmail: toUserEmail||"", bookId, bookTitle, campusLocation: campusLocation||"", message: message||"", status: "pending" });

    await Notification.create({ userName: toUser, userEmail: toUserEmail||"", type: "exchange_request", message: `${fromUser} wants to exchange "${bookTitle}" with you. Location: ${campusLocation||"TBD"}.` });
    logActivity("Exchange Request", fromUser, `Sent exchange request to ${toUser} for "${bookTitle}"`);
    res.json({ success: true, exchange: { ...exchange.toObject(), id: exchange._id } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Get user's exchanges (sent and received)
router.get("/exchanges/user/:userName", async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.name !== req.params.userName) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only view your own exchanges." });
    }
    const exchanges = await Exchange.find({ $or: [{ fromUser: req.params.userName }, { toUser: req.params.userName }] }).sort({ createdAt: -1 });
    res.json(exchanges.map(e => ({ ...e.toObject(), id: e._id })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Get ALL exchanges (Admin) — paginated
router.get("/exchanges", verifyAdmin, async (req, res) => {
  try {
    let page  = Math.max(1, parseInt(req.query.page)  || 1);
    let limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const totalRecords = await Exchange.countDocuments(filter);
    const totalPages   = Math.ceil(totalRecords / limit) || 1;
    page = Math.min(page, totalPages);
    const skip = (page - 1) * limit;

    const exchanges = await Exchange.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
    res.json({
      success: true,
      data: exchanges.map(e => ({ ...e.toObject(), id: e._id })),
      pagination: { page, limit, totalRecords, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 }
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Accept exchange
router.put("/exchanges/:id/accept", async (req, res) => {
  try {
    const { campusLocation } = req.body;
    const checkEx = await Exchange.findById(req.params.id);
    if (!checkEx) return res.status(404).json({ message: "Exchange not found." });
    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.name !== checkEx.toUser) {
      return res.status(403).json({ success: false, message: "Forbidden. Only the designated recipient can accept/reject this exchange." });
    }
    const exchange = await Exchange.findByIdAndUpdate(req.params.id, { status: "accepted", campusLocation: campusLocation || "", respondedAt: new Date() }, { new: true });
    if (!exchange) return res.status(404).json({ message: "Exchange not found." });
    await Notification.create({ userName: exchange.fromUser, userEmail: exchange.fromUserEmail, type: "exchange_update", message: `${exchange.toUser} accepted your exchange for "${exchange.bookTitle}". Meet at: ${exchange.campusLocation||"TBD"}. Waiting for Admin approval.` });
    logActivity("Accept Exchange", exchange.toUser, `Accepted exchange for "${exchange.bookTitle}"`);
    res.json({ success: true, exchange: { ...exchange.toObject(), id: exchange._id } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Reject exchange
router.put("/exchanges/:id/reject", async (req, res) => {
  try {
    const checkEx = await Exchange.findById(req.params.id);
    if (!checkEx) return res.status(404).json({ message: "Exchange not found." });
    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.name !== checkEx.toUser) {
      return res.status(403).json({ success: false, message: "Forbidden. Only the designated recipient can accept/reject this exchange." });
    }
    const exchange = await Exchange.findByIdAndUpdate(req.params.id, { status: "rejected", respondedAt: new Date() }, { new: true });
    if (!exchange) return res.status(404).json({ message: "Exchange not found." });
    await Notification.create({ userName: exchange.fromUser, userEmail: exchange.fromUserEmail, type: "exchange_update", message: `${exchange.toUser} declined your exchange request for "${exchange.bookTitle}".` });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin approve exchange
router.put("/exchanges/:id/approve", verifyAdmin, async (req, res) => {
  try {
    const exchange = await Exchange.findByIdAndUpdate(req.params.id, { status: "approved" }, { new: true });
    if (!exchange) return res.status(404).json({ message: "Exchange not found." });
    await Notification.create({ userName: exchange.fromUser, type: "exchange_update", message: `Admin approved exchange for "${exchange.bookTitle}". Please hand over the book to ${exchange.toUser}.` });
    await Notification.create({ userName: exchange.toUser, type: "exchange_update", message: `Admin approved exchange for "${exchange.bookTitle}". Once you receive it from ${exchange.fromUser}, click "Mark Received".` });
    res.json({ success: true, exchange: { ...exchange.toObject(), id: exchange._id } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Complete exchange (Student 1 confirms handover)
router.put("/exchanges/:id/complete", async (req, res) => {
  try {
    const checkEx = await Exchange.findById(req.params.id);
    if (!checkEx) return res.status(404).json({ message: "Exchange not found." });
    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.name !== checkEx.fromUser) {
      return res.status(403).json({ success: false, message: "Forbidden. Only the initiating party can complete this exchange." });
    }
    const exchange = await Exchange.findByIdAndUpdate(req.params.id, { status: "completed", completedAt: new Date() }, { new: true });
    if (!exchange) return res.status(404).json({ message: "Exchange not found." });

    const book = await Book.findById(exchange.bookId);
    
    // 1. Find toUser's active transaction (the one who HAS the book)
    const senderUser = await User.findOne({ name: exchange.toUser });
    const senderTx = await Transaction.findOne({ userId: senderUser?._id, bookId: exchange.bookId, status: "issued" });
    
    let copyId = null;
    if (senderTx) {
      senderTx.status = "returned";
      senderTx.returnDate = new Date();
      let overdueFine = senderTx.returnDate > senderTx.dueDate ? Math.ceil((senderTx.returnDate - senderTx.dueDate) / (1000 * 60 * 60 * 24)) * 5 : 0;
      senderTx.overdueFine = overdueFine;
      senderTx.totalFine = overdueFine + (senderTx.damageFine || 0);
      if (senderTx.totalFine > 0) senderTx.fineStatus = "unpaid";
      await senderTx.save();
      copyId = senderTx.copyId;
      
      if (senderUser) {
        const accountQr = await Account.findOne({ email: senderUser.contact });
        if (accountQr && overdueFine === 0) {
          accountQr.points = (accountQr.points || 0) + 5;
          await accountQr.save();
        }
      }
    }

    // 2. Create new 14-day transaction for the fromUser (the one who requested/WANTS the book)
    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 14);
    const receiverRecord = await User.findOne({ name: exchange.fromUser });
    const newTx = await Transaction.create({ bookId: exchange.bookId, userId: receiverRecord ? receiverRecord._id : null, copyId: copyId, userName: exchange.fromUser, userRole: "student", issueDate: now, dueDate, status: "issued", issuedVia: "exchange" });

    // 3. Update copy if applicable
    if (copyId) {
      await BookCopy.findByIdAndUpdate(copyId, { currentIssuedTo: exchange.fromUser, currentTransactionId: newTx._id });
    }

    await Notification.create({ userName: exchange.fromUser, userEmail: exchange.fromUserEmail, type: "general", message: `Exchange of "${exchange.bookTitle}" completed! New due date: ${dueDate.toLocaleDateString("en-IN")}.` });
    logActivity("Complete Exchange", exchange.fromUser, `Completed exchange of "${exchange.bookTitle}" from ${exchange.toUser} directly`);
    res.json({ success: true, dueDate: dueDate.toISOString() });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ REPORTS (extended fine/export) ============

// Fine overview
router.get("/reports/fines", verifyAdmin, async (req, res) => {
  try {
    const now = new Date();
    const allTx = await Transaction.find();
    const fineRecords = [];
    for (const t of allTx) {
      const fine = calcFine(t);
      if (fine > 0 || t.damageFine > 0) {
        const book = await Book.findById(t.bookId);
        fineRecords.push({
          txId: t._id, userName: t.userName, bookTitle: book ? book.title : "Deleted",
          issueDate: t.issueDate, dueDate: t.dueDate, returnDate: t.returnDate,
          status: t.status, overdueFine: t.overdueFine || fine, damageFine: t.damageFine || 0,
          totalFine: t.totalFine || (fine + (t.damageFine||0)), damageNotes: t.damageNotes||"",
          fineStatus: t.fineStatus || (fine > 0 ? "unpaid" : "none"),
          paymentMethod: t.paymentMethod || "none", paymentDate: t.paymentDate
        });
      }
    }
    const grandTotal = fineRecords.reduce((s,r) => s + r.totalFine, 0);
    const totalPaid = fineRecords.filter(r => r.fineStatus === "paid").reduce((s,r) => s + r.totalFine, 0);
    const totalUnpaid = grandTotal - totalPaid;
    res.json({ records: fineRecords, grandTotal, totalPaid, totalUnpaid });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ CSV EXPORTS ============

router.get("/export/issues", verifyAdmin, async (req, res) => {
  try {
    const txs = await Transaction.find().sort({ createdAt: -1 });
    const rows = [];
    for (const t of txs) {
      const book = await Book.findById(t.bookId);
      const fine = calcFine(t);
      rows.push([t.userName, book ? book.title : "Deleted", t.issueDate ? new Date(t.issueDate).toLocaleDateString("en-IN") : "", t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-IN") : "", t.returnDate ? new Date(t.returnDate).toLocaleDateString("en-IN") : "-", t.status, fine, t.fineStatus || "none", t.paymentMethod || "none"].join(","));
    }
    const csv = ["User,Book,Issue Date,Due Date,Return Date,Status,Fine,Fine Status,Payment Method", ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=issue-records.csv");
    res.send(csv);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/export/fines", verifyAdmin, async (req, res) => {
  try {
    const txs = await Transaction.find();
    const rows = [];
    for (const t of txs) {
      const fine = calcFine(t);
      if (fine > 0 || t.damageFine > 0) {
        const book = await Book.findById(t.bookId);
        rows.push([t.userName, book ? book.title : "Deleted", t.overdueFine||fine, t.damageFine||0, t.totalFine||(fine+(t.damageFine||0)), t.fineStatus||"unpaid", t.paymentMethod||"none", t.paymentDate ? new Date(t.paymentDate).toLocaleDateString("en-IN") : "-"].join(","));
      }
    }
    const csv = ["User,Book,Overdue Fine,Damage Fine,Total Fine,Status,Payment Method,Payment Date", ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=fine-report.csv");
    res.send(csv);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/export/inventory", verifyAdmin, async (req, res) => {
  try {
    const books = await Book.find().sort({ title: 1 });
    const rows = [];
    for (const b of books) {
      const issueCount = await Transaction.countDocuments({ bookId: b._id });
      rows.push([`"${b.title}"`, `"${b.author}"`, b.category, b.isbn||"", b.totalCopies, b.availableCopies, b.totalCopies - b.availableCopies, issueCount].join(","));
    }
    const csv = ["Title,Author,Category,ISBN,Total Copies,Available,Issued,Times Borrowed", ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=inventory.csv");
    res.send(csv);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ PDF EXPORTS ============

router.get("/export/pdf/issues", verifyAdmin, async (req, res) => {
  try {
    const txs = await Transaction.find().sort({ createdAt: -1 });
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=issue-records.pdf");
    doc.pipe(res);
    
    doc.fontSize(20).text("Issue Records", { align: "center" });
    doc.moveDown();
    
    for (const t of txs) {
      const book = await Book.findById(t.bookId);
      const fine = calcFine(t);
      doc.fontSize(12).text(`User: ${t.userName} | Book: ${book ? book.title : "Deleted"}`);
      doc.fontSize(10).text(`Issued: ${t.issueDate ? new Date(t.issueDate).toLocaleDateString("en-IN") : ""} | Due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-IN") : ""} | Returned: ${t.returnDate ? new Date(t.returnDate).toLocaleDateString("en-IN") : "-"}`);
      doc.fontSize(10).text(`Status: ${t.status} | Fine: Rs.${fine} (${t.fineStatus || "none"})`);
      doc.moveDown();
    }
    
    doc.end();
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/export/pdf/fines", verifyAdmin, async (req, res) => {
  try {
    const txs = await Transaction.find();
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=fine-report.pdf");
    doc.pipe(res);
    
    doc.fontSize(20).text("Fine Reports", { align: "center" });
    doc.moveDown();
    
    for (const t of txs) {
      const fine = calcFine(t);
      if (fine > 0 || t.damageFine > 0) {
        const book = await Book.findById(t.bookId);
        doc.fontSize(12).text(`User: ${t.userName} | Book: ${book ? book.title : "Deleted"}`);
        doc.fontSize(10).text(`Overdue Fine: Rs.${t.overdueFine || fine} | Damage Fine: Rs.${t.damageFine || 0} | Total: Rs.${t.totalFine || (fine + (t.damageFine || 0))}`);
        doc.fontSize(10).text(`Status: ${t.fineStatus || "unpaid"} | Method: ${t.paymentMethod || "none"} | Date: ${t.paymentDate ? new Date(t.paymentDate).toLocaleDateString("en-IN") : "-"}`);
        doc.moveDown();
      }
    }
    
    doc.end();
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/export/pdf/inventory", verifyAdmin, async (req, res) => {
  try {
    const books = await Book.find().sort({ title: 1 });
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=inventory.pdf");
    doc.pipe(res);
    
    doc.fontSize(20).text("Library Inventory", { align: "center" });
    doc.moveDown();
    
    for (const b of books) {
      const issueCount = await Transaction.countDocuments({ bookId: b._id });
      doc.fontSize(12).text(`Title: ${b.title}`);
      doc.fontSize(10).text(`Author: ${b.author} | Category: ${b.category}`);
      doc.fontSize(10).text(`Total: ${b.totalCopies} | Available: ${b.availableCopies} | Borrowed: ${issueCount}`);
      doc.moveDown();
    }
    
    doc.end();
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ BOOK BORROWERS LOOKUP (for exchange) ============
router.get("/borrowers", async (req, res) => {
  try {
    const q = (req.query.q || "").toLowerCase();
    if (!q || q.length < 2) return res.json([]);
    
    // Find books matching the title
    const books = await Book.find({ title: { $regex: q, $options: "i" } });
    if (!books.length) return res.json([]);
    
    const bookIds = books.map(b => b._id);
    // Find active (issued) transactions for those books
    const txs = await Transaction.find({ bookId: { $in: bookIds }, status: "issued" });
    
    const results = txs.map(t => {
      const book = books.find(b => b._id.toString() === t.bookId.toString());
      return {
        userName: t.userName,
        bookTitle: book ? book.title : "Unknown",
        dueDate: t.dueDate,
        issueDate: t.issueDate
      };
    });
    res.json(results);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ============ GAMIFICATION ============

// Get Leaderboard (Top 5 users by points)
router.get("/gamification/leaderboard", async (req, res) => {
  try {
    const topAccounts = await Account.find({ role: { $in: ["student", "teacher"] } })
      .sort({ points: -1 })
      .limit(5)
      .select("name points readingStreak profilePicture");
    res.json(topAccounts);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Get User's Gamification Stats
router.get("/gamification/user/:email", async (req, res) => {
  try {
    // Authorization Check: Student can only view their own gamification stats; Admin/Owner can view anyone's.
    if (req.user.role !== "admin" && req.user.role !== "owner" && req.user.email !== req.params.email) {
      return res.status(403).json({ success: false, message: "Forbidden. You can only view your own gamification stats." });
    }
    const account = await Account.findOne({ email: req.params.email });
    if (!account) return res.status(404).json({ message: "Account not found." });
    
    // Determine Rank
    let rank = "Novice";
    if (account.points >= 50) rank = "Bookworm";
    if (account.points >= 150) rank = "Scholar";
    if (account.points >= 300) rank = "Grandmaster";

    res.json({
      points: account.points || 0,
      readingStreak: account.readingStreak || 0,
      rank: rank,
      badges: account.badges || []
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
