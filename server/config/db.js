const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        if (!process.env.DB) {
            console.warn("DB connection string is not set, skipping MongoDB connection");
            return;
        }

        await mongoose.connect(process.env.DB);
        console.log("Successfully connected to MongoDB");
    } catch (error) {
        console.error("Database connection failed:", error.message);
    }
};

module.exports = connectDB;