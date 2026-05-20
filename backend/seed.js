const mongoose = require("mongoose");
require("dotenv").config();
require("dns").setServers(["8.8.8.8", "8.8.4.4"]);

const Account = require("./models/Account");
const Book = require("./models/Book");
const User = require("./models/User");
const Transaction = require("./models/Transaction");
const Request = require("./models/Request");
const Review = require("./models/Review");
const Notification = require("./models/Notification");
const EBook = require("./models/EBook");
const OTP = require("./models/OTP");
const ActivityLog = require("./models/ActivityLog");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/booksphere";

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    console.log("\n  Connected to MongoDB — Seeding...\n");

    await Promise.all([
      Account.deleteMany({}), Book.deleteMany({}), User.deleteMany({}),
      Transaction.deleteMany({}), Request.deleteMany({}), Review.deleteMany({}),
      Notification.deleteMany({}), EBook.deleteMany({}), OTP.deleteMany({}),
      ActivityLog.deleteMany({})
    ]);

    const accounts = await Account.insertMany([
      { name: "Admin", email: "admin@booksphere.com", role: "admin" },
      { name: "Anay", email: "anay@booksphere.com", role: "admin" },
      { name: "Student", email: "student@booksphere.com", role: "student" },
      { name: "Rahul", email: "rahul@booksphere.com", role: "student" },
      { name: "Priya Patel", email: "priya@booksphere.com", role: "student" },
      { name: "Amit Kumar", email: "amit@booksphere.com", role: "student" },
      { name: "Sneha Gupta", email: "sneha@booksphere.com", role: "student" },
      { name: "Vikram Singh", email: "vikram@booksphere.com", role: "student" },
      { name: "Neha Sharma", email: "neha@booksphere.com", role: "student" }
    ]);
    console.log("  ✓ " + accounts.length + " accounts");

    const books = await Book.insertMany([
      { title: "The Great Gatsby", author: "F. Scott Fitzgerald", category: "Fiction", isbn: "978-0743273565", publisher: "Scribner", year: 1925, description: "A story of the mysteriously wealthy Jay Gatsby and his love for Daisy Buchanan.", totalCopies: 5, availableCopies: 5 },
      { title: "To Kill a Mockingbird", author: "Harper Lee", category: "Fiction", isbn: "978-0061120084", publisher: "HarperCollins", year: 1960, description: "A novel about racial injustice in the American South through the eyes of a child.", totalCopies: 3, availableCopies: 3 },
      { title: "Introduction to Algorithms", author: "Thomas H. Cormen", category: "Computer Science", isbn: "978-0262033848", publisher: "MIT Press", year: 2009, description: "The comprehensive textbook on algorithms, commonly known as CLRS.", totalCopies: 4, availableCopies: 4 },
      { title: "Clean Code", author: "Robert C. Martin", category: "Programming", isbn: "978-0132350884", publisher: "Prentice Hall", year: 2008, description: "A handbook of agile software craftsmanship.", totalCopies: 6, availableCopies: 6 },
      { title: "Data Structures and Algorithms", author: "Narasimha Karumanchi", category: "Computer Science", isbn: "978-8192107547", publisher: "CareerMonk", year: 2016, description: "Made easy for interviews and competitive programming.", totalCopies: 3, availableCopies: 3 },
      { title: "The Pragmatic Programmer", author: "David Thomas & Andrew Hunt", category: "Programming", isbn: "978-0135957059", publisher: "Addison-Wesley", year: 2019, description: "Your journey to mastery. Classic tips for software developers.", totalCopies: 2, availableCopies: 2 },
      { title: "Sapiens: A Brief History of Humankind", author: "Yuval Noah Harari", category: "Non-Fiction", isbn: "978-0062316110", publisher: "Harper", year: 2015, description: "A sweeping narrative of human history from the Stone Age to the present.", totalCopies: 4, availableCopies: 4 },
      { title: "Atomic Habits", author: "James Clear", category: "Self-Help", isbn: "978-0735211292", publisher: "Avery", year: 2018, description: "Tiny changes, remarkable results. An easy way to build good habits.", totalCopies: 5, availableCopies: 5 },
      { title: "Operating System Concepts", author: "Abraham Silberschatz", category: "Computer Science", isbn: "978-1119800361", publisher: "Wiley", year: 2021, description: "The definitive guide to OS concepts, aka the Dinosaur Book.", totalCopies: 4, availableCopies: 4 },
      { title: "Computer Networking", author: "James Kurose", category: "Computer Science", isbn: "978-0136681557", publisher: "Pearson", year: 2020, description: "Networking fundamentals from application layer to physical layer.", totalCopies: 3, availableCopies: 3 },
      { title: "Database System Concepts", author: "Abraham Silberschatz", category: "Computer Science", isbn: "978-0078022159", publisher: "McGraw-Hill", year: 2019, description: "Comprehensive coverage of database systems.", totalCopies: 5, availableCopies: 5 },
      { title: "1984", author: "George Orwell", category: "Fiction", isbn: "978-0451524935", publisher: "Signet Classic", year: 1949, description: "A dystopian masterpiece about totalitarianism and surveillance.", totalCopies: 4, availableCopies: 4 },
      { title: "Rich Dad Poor Dad", author: "Robert Kiyosaki", category: "Self-Help", isbn: "978-1612680194", publisher: "Plata Publishing", year: 1997, description: "Financial education through lessons from two dads.", totalCopies: 3, availableCopies: 3 },
      { title: "Design Patterns", author: "Gang of Four", category: "Programming", isbn: "978-0201633610", publisher: "Addison-Wesley", year: 1994, description: "Elements of reusable object-oriented software.", totalCopies: 3, availableCopies: 3 },
      { title: "The Art of Computer Programming", author: "Donald Knuth", category: "Computer Science", isbn: "978-0201896831", publisher: "Addison-Wesley", year: 1997, description: "The bible of computer science by Donald Knuth.", totalCopies: 2, availableCopies: 2 },
      { title: "Thinking, Fast and Slow", author: "Daniel Kahneman", category: "Psychology", isbn: "978-0374533557", publisher: "Farrar Straus Giroux", year: 2011, description: "Nobel laureate explores how we think and make decisions.", totalCopies: 3, availableCopies: 3 },
      { title: "Python Crash Course", author: "Eric Matthes", category: "Programming", isbn: "978-1593279288", publisher: "No Starch Press", year: 2019, description: "A hands-on, project-based introduction to Python.", totalCopies: 4, availableCopies: 4 },
      { title: "Artificial Intelligence: A Modern Approach", author: "Stuart Russell & Peter Norvig", category: "Computer Science", isbn: "978-0134610993", publisher: "Pearson", year: 2020, description: "The leading textbook in AI used in 1500+ universities.", totalCopies: 3, availableCopies: 3 },
      { title: "The Alchemist", author: "Paulo Coelho", category: "Fiction", isbn: "978-0062315007", publisher: "HarperOne", year: 1988, description: "A mystical story about a shepherd boy who dreams of finding treasure.", totalCopies: 5, availableCopies: 5 },
      { title: "Ikigai", author: "Hector Garcia & Francesc Miralles", category: "Self-Help", isbn: "978-0143130727", publisher: "Penguin", year: 2017, description: "The Japanese secret to a long and happy life.", totalCopies: 4, availableCopies: 4 }
    ]);
    console.log("  ✓ " + books.length + " books");

    const users = await User.insertMany([
      { name: "Rahul Sharma", contact: "+91 98765 43210" },
      { name: "Priya Patel", contact: "+91 87654 32109" },
      { name: "Amit Kumar", contact: "+91 76543 21098" },
      { name: "Sneha Gupta", contact: "+91 65432 10987" },
      { name: "Vikram Singh", contact: "+91 54321 09876" },
      { name: "Neha Sharma", contact: "+91 43210 98765" }
    ]);
    console.log("  ✓ " + users.length + " users");

    const reviews = await Review.insertMany([
      { bookId: books[0]._id, userName: "Rahul", userEmail: "rahul@booksphere.com", rating: 5, comment: "Absolute masterpiece. Fitzgerald at his best!" },
      { bookId: books[0]._id, userName: "Priya Patel", userEmail: "priya@booksphere.com", rating: 4, comment: "Beautiful prose. Still relevant." },
      { bookId: books[3]._id, userName: "Amit Kumar", userEmail: "amit@booksphere.com", rating: 5, comment: "Every developer should read this." },
      { bookId: books[7]._id, userName: "Sneha Gupta", userEmail: "sneha@booksphere.com", rating: 5, comment: "Changed my life. Practical and actionable." },
      { bookId: books[7]._id, userName: "Vikram Singh", userEmail: "vikram@booksphere.com", rating: 4, comment: "Great book on habits. Highly recommended." },
      { bookId: books[2]._id, userName: "Student", userEmail: "student@booksphere.com", rating: 4, comment: "Essential for algorithm studies." },
      { bookId: books[11]._id, userName: "Neha Sharma", userEmail: "neha@booksphere.com", rating: 5, comment: "Chillingly relevant even today!" },
      { bookId: books[18]._id, userName: "Rahul", userEmail: "rahul@booksphere.com", rating: 5, comment: "A beautiful journey of self-discovery." }
    ]);
    console.log("  ✓ " + reviews.length + " reviews");

    // E-Books — Real programming and classic books with PDF/Text links
    const ebooks = await EBook.insertMany([
      { title: "Eloquent JavaScript", author: "Marijn Haverbeke", category: "Programming", description: "A modern introduction to programming.", pdfUrl: "https://eloquentjavascript.net/Eloquent_JavaScript.pdf", pages: 472, coverColor: "#f1c40f", language: "English" },
      { title: "Think Python", author: "Allen B. Downey", category: "Programming", description: "How to think like a computer scientist.", pdfUrl: "https://greenteapress.com/thinkpython2/thinkpython2.pdf", pages: 288, coverColor: "#3498db", language: "English" },
      { title: "Dive Into Deep Learning", author: "Aston Zhang et al.", category: "AI & Machine Learning", description: "An interactive deep learning book with code, math, and discussions.", pdfUrl: "https://d2l.ai/d2l-en.pdf", pages: 1045, coverColor: "#e67e22", language: "English" },
      { title: "Think Java", author: "Allen B. Downey", category: "Programming", description: "How to think like a computer scientist using Java.", pdfUrl: "https://greenteapress.com/thinkjava6/thinkjava.pdf", pages: 305, coverColor: "#c0392b", language: "English" },
      { title: "Mathematics for Machine Learning", author: "Marc Peter Deisenroth", category: "AI & Machine Learning", description: "The foundational math needed to understand machine learning algorithms.", pdfUrl: "https://mml-book.github.io/book/mml-book.pdf", pages: 398, coverColor: "#16a085", language: "English" },
      { title: "Pro Git", author: "Scott Chacon", category: "Computer Science", description: "The official guide to the Git version control system.", pdfUrl: "https://github.com/progit/progit2/releases/download/2.1.373/progit.pdf", pages: 504, coverColor: "#e74c3c", language: "English" },
      { title: "Convex Optimization", author: "Stephen Boyd", category: "Mathematics", description: "A comprehensive textbook on convex optimization.", pdfUrl: "https://web.stanford.edu/~boyd/cvxbook/bv_cvxbook.pdf", pages: 730, coverColor: "#8e44ad", language: "English" },
      { title: "Reinforcement Learning: An Introduction", author: "Richard S. Sutton", category: "AI & Machine Learning", description: "The definitive introduction to reinforcement learning.", pdfUrl: "http://incompleteideas.net/book/RLbook2020.pdf", pages: 548, coverColor: "#2980b9", language: "English" },
      { title: "Think Stats", author: "Allen B. Downey", category: "Data Science", description: "Exploratory Data Analysis in Python.", pdfUrl: "https://greenteapress.com/thinkstats2/thinkstats2.pdf", pages: 226, coverColor: "#27ae60", language: "English" },
      { title: "Algorithms", author: "Jeff Erickson", category: "Computer Science", description: "A highly acclaimed algorithms textbook.", pdfUrl: "https://upload.wikimedia.org/wikipedia/commons/e/e0/Algorithms-jeff-erickson-2019-01-01.pdf", pages: 472, coverColor: "#34495e", language: "English" },
      { title: "Information Theory, Inference, and Learning Algorithms", author: "David J.C. MacKay", category: "AI & Machine Learning", description: "A textbook on information theory and machine learning.", pdfUrl: "http://www.inference.org.uk/itprnn/book.pdf", pages: 628, coverColor: "#1abc9c", language: "English" },
      { title: "Think Bayes", author: "Allen B. Downey", category: "Data Science", description: "Bayesian Statistics in Python.", pdfUrl: "https://greenteapress.com/thinkbayes/thinkbayes.pdf", pages: 195, coverColor: "#d35400", language: "English" }
    ]);
    console.log("  ✓ " + ebooks.length + " E-Books");

    console.log("\n  ✅ Database seeded successfully!\n");
    console.log("  🔐 Authentication: Email OTP (Passwordless)");
    console.log("  Admin:     admin@booksphere.com (select Admin role → Send OTP)");
    console.log("  Student:   student@booksphere.com (select Student role → Send OTP)");
    console.log("\n  💡 Tip: OTP will be printed in the server console if email delivery fails.\n");
    process.exit(0);
  } catch (err) {
    console.error("  ✗ Seed error:", err.message);
    process.exit(1);
  }
}

seed();
