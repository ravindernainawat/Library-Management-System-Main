const mongoose = require("mongoose");

const bookCopySchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
  copyNumber: { type: Number, required: true },
  qrCode: { type: String, default: "" },
  qrData: { type: String, default: "" },
  status: { type: String, enum: ["available", "issued", "reserved", "damaged", "lost"], default: "available" },
  condition: { type: String, enum: ["new", "good", "fair", "poor", "damaged"], default: "good" },
  // Shelf Location
  shelfLocation: {
    aisle: { type: String, default: "" },
    rack: { type: String, default: "" },
    position: { type: String, default: "" }
  },
  // Damage history
  damageHistory: [{
    date: { type: Date, default: Date.now },
    description: { type: String },
    reportedBy: { type: String }
  }],
  currentIssuedTo: { type: String, default: "" },
  currentTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction", default: null }
}, { timestamps: true });

bookCopySchema.index({ bookId: 1, copyNumber: 1 }, { unique: true });
bookCopySchema.index({ qrData: 1 });

module.exports = mongoose.model("BookCopy", bookCopySchema);
