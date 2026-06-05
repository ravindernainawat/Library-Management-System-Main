const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String },
  role: { type: String, enum: ["owner", "admin", "teacher", "student"], required: true },
  status: { type: String, enum: ["active", "pending", "blocked"], default: "active" },
  blockedReason: { type: String, default: "" },
  blockedAt: { type: Date, default: null },
  blockedBy: { type: String, default: "" },
  approvedBy: { type: String, default: "" },
  approvedAt: { type: Date, default: null },
  profilePicture: { type: String, default: "" },
  contactNumber: { type: String, default: "" },
  loginOtp: { type: String, default: "" },
  loginOtpExpires: { type: Date, default: null },
  resetOtp: { type: String, default: "" },
  resetOtpExpires: { type: Date, default: null },
  points: { type: Number, default: 0 },
  readingStreak: { type: Number, default: 0 },
  lastBorrowDate: { type: Date, default: null },
  badges: { type: [String], default: [] }
}, { timestamps: true });

accountSchema.index({ role: 1, points: -1 });

module.exports = mongoose.model("Account", accountSchema);
