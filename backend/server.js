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

app.use(
    cors({
        origin: ["http://localhost:5173", /^chrome-extension:\/\//],
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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
