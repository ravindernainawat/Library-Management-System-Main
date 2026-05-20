const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// Register models
require("./models/Account");
require("./models/User");
const Notification = require("./models/Notification");

async function runTest() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/booksphere";
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  } catch (err) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    const dbPath = path.join(__dirname, "data", "db");
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(dbPath, { recursive: true });
    }
    const mongod = await MongoMemoryServer.create({ instance: { dbPath, storageEngine: "wiredTiger" } });
    await mongoose.connect(mongod.getUri());
  }

  console.log("✅ Connected to Database.");
  console.log(`✉️ Sending test email to ${process.env.SMTP_EMAIL}...`);

  try {
    const notif = await Notification.create({
      userName: "Admin",
      userEmail: process.env.SMTP_EMAIL,
      type: "general",
      message: "Hello! This is a test email from BookSphere Library System to verify that your Nodemailer configuration is working perfectly."
    });

    console.log("✅ Notification created in database.");
    
    // Give the background hook a couple of seconds to finish SMTP sending
    setTimeout(async () => {
      const check = await Notification.findById(notif._id);
      if (check && check.emailSent) {
        console.log("✅ SUCCESS: Email successfully sent and logged!");
      } else {
        console.log("❌ FAILED: Notification created, but email failed to send.");
      }
      process.exit(0);
    }, 4000);
  } catch (e) {
    console.error("Error:", e);
    process.exit(1);
  }
}

runTest();
