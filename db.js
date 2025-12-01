const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config(); // Load .env variables

const uri = process.env.MONGO_URI; // Get URL from .env

const connectDB = async () => {
  try {
    await mongoose.connect(uri);

    console.log("✅ MongoDB Connected Successfully");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);
    process.exit(1); // stop the app if connection fails
  }
};

module.exports = { connectDB };
