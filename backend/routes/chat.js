const express = require('express');
const router = express.Router();
const Book = require('../models/Book');
const { verifyToken } = require('../middleware/auth');

router.post('/', verifyToken, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, message: "Message is required." });

    // Fetch relevant library context dynamically based on search query keywords (text index)
    let relevantBooks = [];
    const queryWords = message.trim();
    if (queryWords.length > 2) {
      try {
        relevantBooks = await Book.find(
          { $text: { $search: queryWords } },
          { score: { $meta: "textScore" } }
        )
        .sort({ score: { $meta: "textScore" } })
        .limit(10)
        .lean();
      } catch (err) {
        // Fallback to simple regex keyword matching if text search fails (e.g. index build pending)
        const re = { $regex: queryWords, $options: "i" };
        relevantBooks = await Book.find({
          $or: [{ title: re }, { author: re }, { category: re }]
        })
        .limit(10)
        .lean();
      }
    }

    // Fallback if no relevant books are found or search was empty
    if (!relevantBooks || relevantBooks.length === 0) {
      // Return 10 general available books
      relevantBooks = await Book.find({ availableCopies: { $gt: 0 } }).limit(10).lean();
    }

    const bookList = relevantBooks.map(b => `- "${b.title}" by ${b.author} (Category: ${b.category}, Available: ${b.availableCopies}/${b.totalCopies})`).join('\n');
    
    const systemPrompt = `You are the AI assistant for BookSphere, an Advance library management system.
Your job is to help users find books, understand library rules, and provide helpful information.
Keep your answers concise, friendly, and formatted nicely with markdown or bullet points.

Here is the current real-time inventory of the library:
${bookList}

Library Rules:
- Books can be issued for 14 days.
- Late fine is Rs. 5 per day.
- Only Admins can approve issues and returns.

User Message: ${message}`;

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.trim() === '') {
      const totalBooksCount = await Book.countDocuments();
      return res.json({ 
        success: true, 
        reply: `Hello! I am the BookSphere AI Assistant.\n\n*Note: My brain is currently offline because the Admin hasn't added the \`GEMINI_API_KEY\` in the \`.env\` file yet!*\n\nBut I can see that we have **${totalBooksCount} books** in the library right now. Ask the Admin to add the key so I can help you search through them!`
      });
    }

    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: systemPrompt,
    });

    res.json({ success: true, reply: response.text });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ success: false, message: "AI Error: " + error.message });
  }
});

module.exports = router;
