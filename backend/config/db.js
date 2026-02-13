const mongoose = require("mongoose");

async function connectDB() {
    try {
        const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/rightclicked";
        await mongoose.connect(uri);
        console.log("MongoDB connected");
    } catch (err) {
        console.error("MongoDB connection error:", err.message);
        process.exit(1);
    }
}

module.exports = connectDB;
