const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const path = require("path");
const fs = require("fs");

const dbPath = path.join(__dirname, "data", "db");

async function inspect() {
  console.log("Starting local DB...");
  const mongod = await MongoMemoryServer.create({
    instance: {
      dbPath: dbPath,
      storageEngine: "wiredTiger"
    }
  });

  const uri = mongod.getUri();
  console.log("DB started at:", uri);
  await mongoose.connect(uri);
  console.log("Connected to MongoDB!");

  // Load models
  const Account = require("./models/Account");
  
  const accounts = await Account.find({});
  console.log("=== ACCOUNTS IN DB ===");
  console.log(JSON.stringify(accounts, null, 2));
  console.log("======================");

  await mongoose.disconnect();
  await mongod.stop();
  console.log("Done.");
}

inspect().catch(e => {
  console.error("Error inspecting:", e);
});
