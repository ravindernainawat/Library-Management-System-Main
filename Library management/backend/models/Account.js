const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "librarian", "student"], required: true }
}, { timestamps: true });

module.exports = mongoose.model("Account", accountSchema);
