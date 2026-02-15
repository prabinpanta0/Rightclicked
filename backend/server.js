require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const postRoutes = require("./routes/posts");
const analyticsRoutes = require("./routes/analytics");

const app = express();
const PORT = process.env.PORT || 3001;

connectDB();

// Security headers
app.use(helmet());

// CORS — allow local dev, Vercel frontend, and browser extensions
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
app.use(
    cors({
        origin: ["http://localhost:5173", FRONTEND_URL, /^chrome-extension:\/\//].filter(Boolean),
        credentials: true,
    }),
);
app.use(express.json({ limit: "1mb" }));

// Prevent NoSQL injection
app.use(mongoSanitize());

app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/analytics", analyticsRoutes);

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Internal server error" });
});

// Start server only when not imported by Vercel's serverless runtime
if (process.env.VERCEL !== "1") {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
