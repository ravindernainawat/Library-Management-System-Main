const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String, required: true },
  category: { type: String, required: true },
  isbn: { type: String, default: "" },
  description: { type: String, default: "" },
  publisher: { type: String, default: "" },
  year: { type: Number, default: null },
  totalCopies: { type: Number, required: true, min: 1 },
  availableCopies: { type: Number, required: true, min: 0 },
  coverImage: { type: String, default: "" }
}, { timestamps: true });

bookSchema.index({ title: "text", author: "text", category: "text" });

module.exports = mongoose.model("Book", bookSchema);
