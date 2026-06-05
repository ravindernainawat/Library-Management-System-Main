const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
  copyId: { type: mongoose.Schema.Types.ObjectId, ref: "BookCopy", default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  userName: { type: String, required: true },
  userRole: { type: String, enum: ["student", "teacher", "admin", "owner"], default: "student" },
  issueDate: { type: Date, required: true, default: Date.now },
  dueDate: { type: Date, required: true },
  returnDate: { type: Date, default: null },
  status: { type: String, enum: ["issued", "returned"], default: "issued" },
  issuedVia: { type: String, enum: ["manual", "qr", "request", "exchange"], default: "manual" },
  // Fine tracking
  overdueFine: { type: Number, default: 0 },
  damageFine: { type: Number, default: 0 },
  damageNotes: { type: String, default: "" },
  totalFine: { type: Number, default: 0 },
  fineStatus: { type: String, enum: ["none", "unpaid", "paid"], default: "none" },
  paymentMethod: { type: String, enum: ["none", "cash", "upi", "online"], default: "none" },
  paymentDate: { type: Date, default: null },
  renewed: { type: Boolean, default: false }
}, { timestamps: true });

transactionSchema.index({ userName: 1 });
transactionSchema.index({ userId: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ status: 1, dueDate: 1 });
transactionSchema.index({ issueDate: 1 });
transactionSchema.index({ returnDate: 1 });
transactionSchema.index({ fineStatus: 1 });

module.exports = mongoose.model("Transaction", transactionSchema);
