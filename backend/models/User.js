const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contact: { type: String, required: true },
  role: { type: String, enum: ["student", "teacher", "admin", "owner"], default: "student" }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
