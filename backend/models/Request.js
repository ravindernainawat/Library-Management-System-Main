const mongoose = require("mongoose");

const requestSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
  bookTitle: { type: String, required: true },
  userName: { type: String, required: true },
  userEmail: { type: String, required: true },
  status: { type: String, enum: ["pending", "approved", "rejected", "issued", "expired"], default: "pending" },
  requestDate: { type: Date, default: Date.now }
}, { timestamps: true });

requestSchema.index({ status: 1 });
requestSchema.index({ bookId: 1 });
requestSchema.index({ userName: 1 });
requestSchema.index({ updatedAt: -1 });
// Compound indexes for common query patterns
requestSchema.index({ userEmail: 1, createdAt: -1 });
requestSchema.index({ bookId: 1, userName: 1, status: 1 });
requestSchema.index({ status: 1, updatedAt: 1 });

module.exports = mongoose.model("Request", requestSchema);
