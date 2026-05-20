const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  userEmail: { type: String, required: true },
  type: { type: String, enum: ["due_reminder", "overdue", "available", "request_update", "general"], required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);
