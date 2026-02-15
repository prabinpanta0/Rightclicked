const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const { authLimiter } = require("../middleware/rateLimit");
const verifyRecaptcha = require("../middleware/recaptcha");

const router = express.Router();

router.use(authLimiter);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitize(str) {
    if (typeof str !== "string") return "";
    return str.trim().slice(0, 255);
}

router.post("/register", verifyRecaptcha, async (req, res) => {
    try {
        const email = sanitize(req.body.email).toLowerCase();
        const password = req.body.password;
        const name = sanitize(req.body.name);

        if (!email || !password || !name) {
            return res.status(400).json({ error: "Email, password, and name are required" });
        }
        if (!EMAIL_RE.test(email)) {
            return res.status(400).json({ error: "Invalid email address" });
        }
        if (typeof password !== "string" || password.length < 8) {
            return res.status(400).json({ error: "Password must be at least 8 characters" });
        }
        if (name.length < 2 || name.length > 100) {
            return res.status(400).json({ error: "Name must be between 2 and 100 characters" });
        }

        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(409).json({ error: "Email already registered" });
        }

        const user = await User.create({ email, password, name });
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });

        res.status(201).json({ token, user });
    } catch (err) {
        res.status(500).json({ error: "Registration failed" });
    }
});

router.post("/login", verifyRecaptcha, async (req, res) => {
    try {
        const email = sanitize(req.body.email).toLowerCase();
        const password = req.body.password;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const valid = await user.comparePassword(password);
        if (!valid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });

        // Track login
        user.lastLogin = new Date();
        await user.save();
        AnalyticsEvent.create({ userId: user._id, event: "session_start" }).catch(() => {});

        res.json({ token, user });
    } catch (err) {
        res.status(500).json({ error: "Login failed" });
    }
});

// ── User settings endpoints ──────────────────────────────────
const authMiddleware = require("../middleware/auth");

// GET /api/auth/settings — return current user profile + AI settings
router.get("/settings", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        // Reset daily count if it's a new day
        const now = new Date();
        const lastReset = user.aiUsage?.lastReset ? new Date(user.aiUsage.lastReset) : new Date(0);
        if (now.toDateString() !== lastReset.toDateString()) {
            user.aiUsage = { dailyCount: 0, lastReset: now };
            await user.save();
        }

        res.json({
            name: user.name,
            email: user.email,
            aiSettings: user.aiSettings || { dailyLimit: 25, autoAnalyze: true },
            aiUsage: {
                used: user.aiUsage?.dailyCount || 0,
                limit: user.aiSettings?.dailyLimit ?? 25,
                remaining: Math.max(0, (user.aiSettings?.dailyLimit ?? 25) - (user.aiUsage?.dailyCount || 0)),
            },
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to get settings" });
    }
});

// PATCH /api/auth/settings — update AI settings
router.patch("/settings", authMiddleware, async (req, res) => {
    try {
        const { dailyLimit, autoAnalyze } = req.body;
        const update = {};

        if (typeof dailyLimit === "number" && dailyLimit >= 0 && dailyLimit <= 100) {
            update["aiSettings.dailyLimit"] = dailyLimit;
        }
        if (typeof autoAnalyze === "boolean") {
            update["aiSettings.autoAnalyze"] = autoAnalyze;
        }

        if (Object.keys(update).length === 0) {
            return res.status(400).json({ error: "No valid settings to update" });
        }

        const user = await User.findByIdAndUpdate(req.userId, { $set: update }, { new: true });
        if (!user) return res.status(404).json({ error: "User not found" });

        res.json({
            aiSettings: user.aiSettings,
            aiUsage: {
                used: user.aiUsage?.dailyCount || 0,
                limit: user.aiSettings?.dailyLimit ?? 25,
                remaining: Math.max(0, (user.aiSettings?.dailyLimit ?? 25) - (user.aiUsage?.dailyCount || 0)),
            },
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to update settings" });
    }
});

module.exports = router;
