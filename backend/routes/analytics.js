const express = require("express");
const mongoose = require("mongoose");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const Post = require("../models/Post");
const User = require("../models/User");
const auth = require("../middleware/auth");

const router = express.Router();

// Public: track event (auth optional — uses token if present)
router.post("/event", async (req, res) => {
    try {
        // Try to get userId from token
        let userId = null;
        const header = req.headers.authorization;
        if (header && header.startsWith("Bearer ")) {
            const jwt = require("jsonwebtoken");
            try {
                const decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
                userId = decoded.userId;
            } catch {}
        }
        if (!userId) return res.status(401).json({ error: "Auth required" });

        const { event, meta } = req.body;
        const allowed = [
            "save_attempt",
            "save_success",
            "save_failure",
            "search",
            "ai_search",
            "page_view",
            "session_start",
            "session_heartbeat",
        ];
        if (!event || !allowed.includes(event)) {
            return res.status(400).json({ error: "Invalid event type" });
        }

        await AnalyticsEvent.create({ userId, event, meta: meta || {} });
        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: "Failed to track event" });
    }
});

// Dashboard summary (authed)
router.get("/dashboard", auth, async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.userId);
        const now = new Date();
        const thirtyDaysAgo = new Date(now - 30 * 86400000);
        const sevenDaysAgo = new Date(now - 7 * 86400000);

        // --- Save success rate ---
        const [saveAttempts, saveSuccesses] = await Promise.all([
            AnalyticsEvent.countDocuments({ userId, event: "save_attempt", createdAt: { $gte: thirtyDaysAgo } }),
            AnalyticsEvent.countDocuments({ userId, event: "save_success", createdAt: { $gte: thirtyDaysAgo } }),
        ]);
        const saveSuccessRate = saveAttempts > 0 ? Math.round((saveSuccesses / saveAttempts) * 100) : null;

        // --- Avg time to save ---
        const timings = await AnalyticsEvent.aggregate([
            {
                $match: {
                    userId,
                    event: "save_success",
                    "meta.timeMs": { $exists: true },
                    createdAt: { $gte: thirtyDaysAgo },
                },
            },
            { $group: { _id: null, avg: { $avg: "$meta.timeMs" } } },
        ]);
        const avgTimeToSaveMs = timings[0]?.avg ? Math.round(timings[0].avg) : null;

        // --- Search usage (last 30 days) ---
        const searchCount = await AnalyticsEvent.countDocuments({
            userId,
            event: { $in: ["search", "ai_search"] },
            createdAt: { $gte: thirtyDaysAgo },
        });

        // --- Weekly active sessions ---
        const weeklySessions = await AnalyticsEvent.countDocuments({
            userId,
            event: "session_start",
            createdAt: { $gte: sevenDaysAgo },
        });

        // --- Total posts / unanalyzed ---
        const [totalPosts, unanalyzedPosts] = await Promise.all([
            Post.countDocuments({ userId }),
            Post.countDocuments({ userId, aiAnalyzed: false }),
        ]);

        // --- User info ---
        const user = await User.findById(req.userId).select("lastLogin createdAt");

        // --- Save activity over last 30 days (daily buckets) ---
        const dailySaves = await Post.aggregate([
            { $match: { userId, dateSaved: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$dateSaved" } },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        // --- Top authors ---
        const topAuthors = await Post.aggregate([
            { $match: { userId } },
            { $group: { _id: "$authorName", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
        ]);

        // --- Topic distribution ---
        const topicDist = await Post.aggregate([
            { $match: { userId, topic: { $ne: "" } } },
            { $group: { _id: "$topic", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 8 },
        ]);

        res.json({
            saveSuccessRate,
            avgTimeToSaveMs,
            searchCount,
            weeklySessions,
            totalPosts,
            unanalyzedPosts,
            lastLogin: user?.lastLogin,
            memberSince: user?.createdAt,
            dailySaves,
            topAuthors,
            topicDistribution: topicDist,
        });
    } catch (err) {
        console.error("Analytics error:", err.message);
        res.status(500).json({ error: "Failed to load analytics" });
    }
});

module.exports = router;
