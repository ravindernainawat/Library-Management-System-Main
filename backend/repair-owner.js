require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

const NEW_EMAIL = "ravindernainawat007@gmail.com";
const NEW_NAME = "Ravinder";
const NEW_PASSWORD = "Owner@1234";

async function repair() {
  const MONGODB_URI = process.env.MONGODB_URI || null;
  let mongod = null;

  try {
    if (MONGODB_URI) {
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
      console.log("  ✓ Connected to external MongoDB");
    } else {
      throw new Error("No MONGODB_URI");
    }
  } catch (err) {
    console.log("  ⚠ Using local persistent DB...");
    const { MongoMemoryServer } = require("mongodb-memory-server");
    const dbPath = path.join(__dirname, "data", "db");
    if (!fs.existsSync(dbPath)) {
      console.error("  ✗ Local DB not found. Start the server first.");
      process.exit(1);
    }
    mongod = await MongoMemoryServer.create({
      instance: { dbPath, storageEngine: "wiredTiger" }
    });
    await mongoose.connect(mongod.getUri());
    console.log("  ✓ Connected to local persistent MongoDB");
  }

  const Account = require("./models/Account");
  const hashed = await bcrypt.hash(NEW_PASSWORD, 10);

  const existing = await Account.findOne({ role: "owner" });
  if (existing) {
    console.log(`  → Found owner account: ${existing.email}`);
    existing.email = NEW_EMAIL.toLowerCase();
    existing.name = NEW_NAME;
    existing.password = hashed;
    existing.status = "active";
    existing.loginOtp = "";
    existing.loginOtpExpires = null;
    existing.resetOtp = "";
    existing.resetOtpExpires = null;
    await existing.save();
    console.log(`  ✓ Owner account updated to: ${NEW_EMAIL}`);
  } else {
    await Account.create({
      name: NEW_NAME,
      email: NEW_EMAIL.toLowerCase(),
      password: hashed,
      role: "owner",
      status: "active"
    });
    console.log(`  ✓ Owner account created: ${NEW_EMAIL}`);
  }

  console.log(`  → Email: ${NEW_EMAIL}`);
  console.log(`  → Password: ${NEW_PASSWORD}`);
  console.log("  ✓ Done! You can now log in as Owner.");

  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  process.exit(0);
}

repair().catch(e => {
  console.error("  ✗ Error:", e.message);
  process.exit(1);
});
