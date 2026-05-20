const mongoose = require("mongoose");

const requestSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
  bookTitle: { type: String, required: true },
  userName: { type: String, required: true },
  userEmail: { type: String, required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  requestDate: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model("Request", requestSchema);
