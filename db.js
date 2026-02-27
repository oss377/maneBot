const mongoose = require("mongoose");
const { MONGO_URI } = require('./config/constants');

const connectDB = async () => {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI is not defined");
    }

    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected Successfully");
    return true;
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);
    throw error; // Let the caller handle retry
  }
};

module.exports = { connectDB };