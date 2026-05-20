const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();
require("dns").setServers(["8.8.8.8", "8.8.4.4"]);
const { MongoMemoryServer } = require("mongodb-memory-server");

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

const ATLAS_URI = process.env.MONGODB_URI;

async function migrate() {
  let localMongod = null;
  try {
    console.log("Starting local DB to extract data...");
    const dbPath = path.join(__dirname, "data", "db");
    
    localMongod = await MongoMemoryServer.create({
      instance: {
        dbPath: dbPath,
        storageEngine: "wiredTiger"
      }
    });

    const localUri = localMongod.getUri();
    await mongoose.connect(localUri);
    console.log("Connected to local DB.");

    // Extract all data
    const localData = {
      accounts: await Account.find({}).lean(),
      books: await Book.find({}).lean(),
      users: await User.find({}).lean(),
      transactions: await Transaction.find({}).lean(),
      requests: await Request.find({}).lean(),
      reviews: await Review.find({}).lean(),
      notifications: await Notification.find({}).lean(),
      ebooks: await EBook.find({}).lean(),
      activitylogs: await ActivityLog.find({}).lean()
    };

    console.log(`Extracted: ${localData.books.length} books, ${localData.accounts.length} accounts, ${localData.users.length} users, ${localData.transactions.length} transactions.`);

    await mongoose.disconnect();
    await localMongod.stop();
    console.log("Local DB stopped.");

    console.log("Connecting to Atlas...");
    await mongoose.connect(ATLAS_URI, { serverSelectionTimeoutMS: 15000 });
    console.log("Connected to Atlas.");

    // Clear Atlas
    console.log("Clearing target collections...");
    await Promise.all([
      Account.deleteMany({}), Book.deleteMany({}), User.deleteMany({}),
      Transaction.deleteMany({}), Request.deleteMany({}), Review.deleteMany({}),
      Notification.deleteMany({}), EBook.deleteMany({}), ActivityLog.deleteMany({})
    ]);

    // Insert data
    console.log("Inserting data to Atlas...");
    if (localData.accounts.length > 0) await Account.insertMany(localData.accounts);
    if (localData.books.length > 0) await Book.insertMany(localData.books);
    if (localData.users.length > 0) await User.insertMany(localData.users);
    if (localData.transactions.length > 0) await Transaction.insertMany(localData.transactions);
    if (localData.requests.length > 0) await Request.insertMany(localData.requests);
    if (localData.reviews.length > 0) await Review.insertMany(localData.reviews);
    if (localData.notifications.length > 0) await Notification.insertMany(localData.notifications);
    if (localData.ebooks.length > 0) await EBook.insertMany(localData.ebooks);
    if (localData.activitylogs.length > 0) await ActivityLog.insertMany(localData.activitylogs);

    console.log("Migration completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    if (localMongod) await localMongod.stop();
    process.exit(1);
  }
}

migrate();
