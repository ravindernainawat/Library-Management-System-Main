const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  userName: { type: String, required: true },
  issueDate: { type: Date, required: true, default: Date.now },
  dueDate: { type: Date, required: true },
  returnDate: { type: Date, default: null },
  status: { type: String, enum: ["issued", "returned"], default: "issued" }
}, { timestamps: true });

module.exports = mongoose.model("Transaction", transactionSchema);
