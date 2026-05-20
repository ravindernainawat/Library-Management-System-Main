const mongoose = require("mongoose");

const ebookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String, default: "" },
  pdfUrl: { type: String, required: true },
  pages: { type: Number, default: 0 },
  language: { type: String, default: "English" },
  coverColor: { type: String, default: "#3b82f6" }
}, { timestamps: true });

module.exports = mongoose.model("EBook", ebookSchema);
