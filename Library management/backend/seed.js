const mongoose = require("mongoose");
require("dotenv").config();

const Account = require("./models/Account");
const Book = require("./models/Book");
const User = require("./models/User");
const Transaction = require("./models/Transaction");
const Request = require("./models/Request");
const Review = require("./models/Review");
const Notification = require("./models/Notification");
const EBook = require("./models/EBook");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/booksphere";

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("\n  Connected to MongoDB — Seeding...\n");

    await Promise.all([
      Account.deleteMany({}), Book.deleteMany({}), User.deleteMany({}),
      Transaction.deleteMany({}), Request.deleteMany({}), Review.deleteMany({}),
      Notification.deleteMany({}), EBook.deleteMany({})
    ]);

    const accounts = await Account.insertMany([
      { name: "Admin", email: "admin@booksphere.com", password: "admin123", role: "admin" },
      { name: "Librarian", email: "librarian@booksphere.com", password: "lib123", role: "librarian" },
      { name: "Anay", email: "anay@booksphere.com", password: "anay123", role: "admin" },
      { name: "Student", email: "student@booksphere.com", password: "student123", role: "student" },
      { name: "Rahul", email: "rahul@booksphere.com", password: "rahul123", role: "student" },
      { name: "Priya Patel", email: "priya@booksphere.com", password: "priya123", role: "student" },
      { name: "Amit Kumar", email: "amit@booksphere.com", password: "amit123", role: "student" },
      { name: "Sneha Gupta", email: "sneha@booksphere.com", password: "sneha123", role: "student" },
      { name: "Vikram Singh", email: "vikram@booksphere.com", password: "vikram123", role: "student" },
      { name: "Neha Sharma", email: "neha@booksphere.com", password: "neha123", role: "student" }
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

    // Digital Library — Free public-domain books (Project Gutenberg)
    const ebooks = await EBook.insertMany([
      { title: "Pride and Prejudice", author: "Jane Austen", category: "Classic Fiction", description: "A romantic novel following Elizabeth Bennet and Mr. Darcy.", pdfUrl: "https://www.gutenberg.org/files/1342/1342-0.txt", pages: 432, coverColor: "#e74c3c" },
      { title: "Adventures of Sherlock Holmes", author: "Arthur Conan Doyle", category: "Mystery", description: "Twelve detective stories featuring Sherlock Holmes.", pdfUrl: "https://www.gutenberg.org/files/1661/1661-0.txt", pages: 307, coverColor: "#2c3e50" },
      { title: "Alice's Adventures in Wonderland", author: "Lewis Carroll", category: "Fantasy", description: "A girl falls down a rabbit hole into a fantasy world.", pdfUrl: "https://www.gutenberg.org/files/11/11-0.txt", pages: 200, coverColor: "#9b59b6" },
      { title: "The Art of War", author: "Sun Tzu", category: "Philosophy", description: "Ancient Chinese military treatise on strategy.", pdfUrl: "https://www.gutenberg.org/files/132/132-0.txt", pages: 68, coverColor: "#c0392b" },
      { title: "A Tale of Two Cities", author: "Charles Dickens", category: "Classic Fiction", description: "Set in London and Paris during the French Revolution.", pdfUrl: "https://www.gutenberg.org/files/98/98-0.txt", pages: 448, coverColor: "#2980b9" },
      { title: "The Republic", author: "Plato", category: "Philosophy", description: "A Socratic dialogue about justice and the ideal state.", pdfUrl: "https://www.gutenberg.org/files/1497/1497-0.txt", pages: 420, coverColor: "#8e44ad" },
      { title: "Frankenstein", author: "Mary Shelley", category: "Science Fiction", description: "Victor Frankenstein and the monster he creates.", pdfUrl: "https://www.gutenberg.org/files/84/84-0.txt", pages: 280, coverColor: "#1abc9c" },
      { title: "Moby Dick", author: "Herman Melville", category: "Classic Fiction", description: "Captain Ahab's obsessive quest to kill the great white whale.", pdfUrl: "https://www.gutenberg.org/files/2701/2701-0.txt", pages: 720, coverColor: "#34495e" },
      { title: "The Prince", author: "Niccolo Machiavelli", category: "Political Science", description: "A 16th-century treatise on political power and leadership.", pdfUrl: "https://www.gutenberg.org/files/1232/1232-0.txt", pages: 140, coverColor: "#d35400" },
      { title: "Dracula", author: "Bram Stoker", category: "Horror", description: "The classic Gothic horror novel about Count Dracula.", pdfUrl: "https://www.gutenberg.org/files/345/345-0.txt", pages: 418, coverColor: "#c0392b" },
      { title: "The Odyssey", author: "Homer", category: "Classic Fiction", description: "Odysseus' epic journey home after the Trojan War.", pdfUrl: "https://www.gutenberg.org/files/1727/1727-0.txt", pages: 560, coverColor: "#16a085" },
      { title: "War and Peace", author: "Leo Tolstoy", category: "Classic Fiction", description: "Russian society during the Napoleonic Era.", pdfUrl: "https://www.gutenberg.org/files/2600/2600-0.txt", pages: 1225, coverColor: "#27ae60" }
    ]);
    console.log("  ✓ " + ebooks.length + " eBooks (Digital Library)");

    console.log("\n  ✅ Database seeded successfully!\n");
    console.log("  Admin:   admin@booksphere.com / admin123");
    console.log("  Student: student@booksphere.com / student123\n");
    process.exit(0);
  } catch (err) {
    console.error("  ✗ Seed error:", err.message);
    process.exit(1);
  }
}

seed();
