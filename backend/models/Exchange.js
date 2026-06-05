const mongoose = require("mongoose");

const exchangeSchema = new mongoose.Schema({
  fromUser: { type: String, required: true },
  fromUserEmail: { type: String, default: "" },
  toUser: { type: String, required: true },
  toUserEmail: { type: String, default: "" },
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
  bookTitle: { type: String, required: true },
  status: { type: String, enum: ["pending", "accepted", "approved", "rejected", "completed", "cancelled"], default: "pending" },
  campusLocation: { type: String, default: "" },
  message: { type: String, default: "" },
  respondedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null }
}, { timestamps: true });

exchangeSchema.index({ fromUser: 1 });
exchangeSchema.index({ toUser: 1 });
exchangeSchema.index({ status: 1 });
exchangeSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Exchange", exchangeSchema);
