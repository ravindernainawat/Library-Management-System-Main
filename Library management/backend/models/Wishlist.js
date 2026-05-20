const mongoose = require("mongoose");

const wishlistSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
  userName: { type: String, required: true },
  userEmail: { type: String, required: true }
}, { timestamps: true });

wishlistSchema.index({ bookId: 1, userEmail: 1 }, { unique: true });

module.exports = mongoose.model("Wishlist", wishlistSchema);
