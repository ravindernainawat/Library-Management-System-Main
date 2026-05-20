const express = require("express");
const router = express.Router();
const Book = require("../models/Book");
const BookCopy = require("../models/BookCopy");
const Transaction = require("../models/Transaction");
const Review = require("../models/Review");
const { logActivity } = require("../utils");
let QRCode;
try { QRCode = require("qrcode"); } catch(e) { QRCode = null; }

// Auto-fetch book details from OpenLibrary API
router.get("/auto-fetch/:isbn", async (req, res) => {
  try {
    const axios = require("axios");
    const isbn = req.params.isbn;
    const response = await axios.get(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
    const data = response.data[`ISBN:${isbn}`];
    
    if (!data) {
      return res.status(404).json({ success: false, message: "No book found with this ISBN on OpenLibrary." });
    }
    
    res.json({
      success: true,
      data: {
        title: data.title || "",
        author: data.authors ? data.authors.map(a => a.name).join(", ") : "",
        publisher: data.publishers ? data.publishers.map(p => p.name).join(", ") : "",
        year: data.publish_date ? data.publish_date : "",
        description: data.subtitle || "",
        category: data.subjects ? data.subjects[0].name : "General"
      }
    });
  } catch (err) {
    console.error("OpenLibrary Fetch Error:", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch from OpenLibrary: " + err.message });
  }
});

// GET all books
router.get("/", async (req, res) => {
  try {
    const books = await Book.find().sort({ createdAt: -1 });
    res.json(books);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET single book
router.get("/:id", async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ message: "Book not found." });
    const reviews = await Review.find({ bookId: book._id }).sort({ createdAt: -1 });
    const avgRating = reviews.length > 0 ? (reviews.reduce((s,r) => s+r.rating,0)/reviews.length).toFixed(1) : 0;
    const issueCount = await Transaction.countDocuments({ bookId: book._id });
    const copies = await BookCopy.find({ bookId: book._id }).sort({ copyNumber: 1 });
    res.json({ ...book.toObject(), id: book._id, reviews, avgRating: parseFloat(avgRating), totalIssues: issueCount, copies });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ADD book
router.post("/", async (req, res) => {
  try {
    const { title, author, category, quantity, isbn, description, publisher, year, department, branch } = req.body;
    if (!title || !author || !category || !quantity) return res.status(400).json({ message: "Title, author, category & quantity required." });
    const qty = parseInt(quantity);
    const newBook = await Book.create({ title, author, category, isbn: isbn||"", description: description||"", publisher: publisher||"", year: year||null, department: department||"", branch: branch||"", totalCopies: qty, availableCopies: qty });
    // Auto-create book copies with QR codes
    for (let i = 1; i <= qty; i++) {
      const qrData = `BOOKSPHERE:${newBook._id}:COPY:${i}`;
      let qrCode = "";
      if (QRCode) { try { qrCode = await QRCode.toDataURL(qrData); } catch(e) {} }
      await BookCopy.create({ bookId: newBook._id, copyNumber: i, qrData, qrCode, status: "available" });
    }
    logActivity("Add Book", "Admin", `Added "${newBook.title}" by ${newBook.author} (${qty} copies)`);
    res.json({ success: true, book: newBook });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
// ADD bulk books
router.post("/bulk", async (req, res) => {
  try {
    const { books } = req.body;
    if (!books || !Array.isArray(books) || books.length === 0) {
      return res.status(400).json({ message: "An array of books is required." });
    }

    let addedCount = 0;
    for (const b of books) {
      const { title, author, category, quantity, isbn, description, publisher, year, department, branch } = b;
      if (!title || !author || !category || !quantity) continue;
      
      const qty = parseInt(quantity);
      if (qty <= 0) continue;

      const newBook = await Book.create({
        title, author, category, 
        isbn: isbn || "", 
        description: description || "", 
        publisher: publisher || "", 
        year: year || null, 
        department: department || "",
        branch: branch || "",
        totalCopies: qty, 
        availableCopies: qty
      });

      // Auto-create book copies with QR codes
      for (let i = 1; i <= qty; i++) {
        const qrData = `BOOKSPHERE:${newBook._id}:COPY:${i}`;
        let qrCode = "";
        if (QRCode) { try { qrCode = await QRCode.toDataURL(qrData); } catch(e) {} }
        await BookCopy.create({ bookId: newBook._id, copyNumber: i, qrData, qrCode, status: "available" });
      }
      addedCount++;
    }

    logActivity("Bulk Add Books", "Admin", `Bulk uploaded ${addedCount} new books`);
    res.json({ success: true, message: `Successfully added ${addedCount} books.`, addedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// EDIT book
router.put("/:id", async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ message: "Book not found." });
    const { title, author, category, quantity, isbn, description, publisher, year, department, branch } = req.body;
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
    book.department = department !== undefined ? department : book.department;
    book.branch = branch !== undefined ? branch : book.branch;
    book.totalCopies = newTotal;
    book.availableCopies = Math.max(0, book.availableCopies + diff);
    await book.save();
    // Add new copies if quantity increased
    if (diff > 0) {
      for (let i = oldTotal + 1; i <= newTotal; i++) {
        const qrData = `BOOKSPHERE:${book._id}:COPY:${i}`;
        let qrCode = "";
        if (QRCode) { try { qrCode = await QRCode.toDataURL(qrData); } catch(e) {} }
        await BookCopy.create({ bookId: book._id, copyNumber: i, qrData, qrCode, status: "available" });
      }
    }
    logActivity("Edit Book", "Admin", `Updated "${book.title}"`);
    res.json({ success: true, book });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE book
router.delete("/:id", async (req, res) => {
  try {
    const hasActive = await Transaction.findOne({ bookId: req.params.id, status: "issued" });
    if (hasActive) return res.status(400).json({ message: "Cannot delete — book has active issues." });
    const book = await Book.findByIdAndDelete(req.params.id);
    await BookCopy.deleteMany({ bookId: req.params.id });
    if (book) logActivity("Delete Book", "Admin", `Deleted "${book.title}"`);
    res.json({ success: true, title: book ? book.title : "" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET book copies
router.get("/:id/copies", async (req, res) => {
  try {
    const copies = await BookCopy.find({ bookId: req.params.id }).sort({ copyNumber: 1 });
    res.json(copies.map(c => ({ ...c.toObject(), id: c._id })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// UPDATE copy (shelf location, condition)
router.put("/copies/:copyId", async (req, res) => {
  try {
    const { aisle, rack, position, condition } = req.body;
    const update = {};
    if (aisle !== undefined || rack !== undefined || position !== undefined) {
      update["shelfLocation.aisle"] = aisle || "";
      update["shelfLocation.rack"] = rack || "";
      update["shelfLocation.position"] = position || "";
    }
    if (condition) update.condition = condition;
    const copy = await BookCopy.findByIdAndUpdate(req.params.copyId, update, { new: true });
    if (!copy) return res.status(404).json({ message: "Copy not found." });
    logActivity("Update Copy", "Admin", `Updated copy #${copy.copyNumber} shelf: ${aisle}/${rack}/${position}`);
    res.json({ success: true, copy });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ADD damage to copy
router.post("/copies/:copyId/damage", async (req, res) => {
  try {
    const { description, reportedBy } = req.body;
    const copy = await BookCopy.findByIdAndUpdate(req.params.copyId,
      { $push: { damageHistory: { description, reportedBy, date: new Date() } }, condition: "damaged" },
      { new: true }
    );
    if (!copy) return res.status(404).json({ message: "Copy not found." });
    logActivity("Report Damage", reportedBy || "Admin", `Damage reported for copy #${copy.copyNumber}: ${description}`);
    res.json({ success: true, copy });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
