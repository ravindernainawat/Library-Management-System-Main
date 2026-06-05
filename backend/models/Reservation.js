const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
  bookTitle: { type: String, required: true },
  userName: { type: String, required: true },
  userEmail: { type: String, default: "" },
  position: { type: Number, required: true },
  status: { type: String, enum: ["waiting", "notified", "fulfilled", "cancelled", "expired"], default: "waiting" },
  notifiedAt: { type: Date, default: null },
  fulfilledAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null }
}, { timestamps: true });

reservationSchema.index({ bookId: 1, status: 1, position: 1 });
reservationSchema.index({ userName: 1 });
reservationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Reservation", reservationSchema);
