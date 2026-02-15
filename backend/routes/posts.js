const express = require("express");
const mongoose = require("mongoose");
const Post = require("../models/Post");
const User = require("../models/User");
const auth = require("../middleware/auth");
const { saveLimiter, aiLimiter } = require("../middleware/rateLimit");
const { analyzePost, generateSearchTerms } = require("../services/ollama");

const router = express.Router();

router.use(auth);

// ── AI quota helper ──────────────────────────────────────────────
// Checks and increments the user's daily AI usage. Returns { allowed, remaining, limit }.
async function checkAiQuota(userId) {
    const user = await User.findById(userId);
    if (!user) return { allowed: false, remaining: 0, limit: 0 };

    const now = new Date();
    const lastReset = user.aiUsage?.lastReset ? new Date(user.aiUsage.lastReset) : new Date(0);

    // Reset counter if it's a new day (UTC)
    if (now.toDateString() !== lastReset.toDateString()) {
        user.aiUsage = { dailyCount: 0, lastReset: now };
    }

    const limit = user.aiSettings?.dailyLimit ?? 25;
    const count = user.aiUsage?.dailyCount ?? 0;

    if (count >= limit) {
        return { allowed: false, remaining: 0, limit };
    }

    user.aiUsage.dailyCount = count + 1;
    user.aiUsage.lastReset = user.aiUsage.lastReset || now;
    await user.save();

    return { allowed: true, remaining: limit - count - 1, limit };
}

// Save a new post
router.post("/", saveLimiter, async (req, res) => {
    try {
        const { authorName, authorUrl, postText, postUrl, timestamp, dateSaved, tags, engagement } = req.body;
        if (!authorName || !postText) {
            return res.status(400).json({ error: "authorName and postText are required" });
        }

        // Duplicate check -- match on postUrl if available, else first 150 chars of text
        let existing = null;
        if (postUrl) {
            existing = await Post.findOne({ userId: req.userId, postUrl });
        }
        if (!existing && postText) {
            existing = await Post.findOne({
                userId: req.userId,
                postText: { $regex: `^${postText.slice(0, 150).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` },
            });
        }
        if (existing) {
            // Update engagement on the existing post if new values are provided
            if (engagement && (engagement.likes || engagement.comments || engagement.reposts)) {
                existing.engagement = {
                    likes: parseInt(engagement.likes) || existing.engagement?.likes || 0,
                    comments: parseInt(engagement.comments) || existing.engagement?.comments || 0,
                    reposts: parseInt(engagement.reposts) || existing.engagement?.reposts || 0,
                };
                await existing.save();
            }
            return res.status(409).json({ error: "Post already saved", post: existing });
        }

        const post = new Post({
            userId: req.userId,
            authorName,
            authorUrl: authorUrl || "",
            postText,
            postUrl: postUrl || "",
            timestamp: timestamp || "",
            dateSaved: dateSaved || new Date(),
            tags: tags || [],
            engagement: {
                likes: engagement?.likes || 0,
                comments: engagement?.comments || 0,
                reposts: engagement?.reposts || 0,
            },
        });
        await post.save();

        // AI analysis runs in background — auto-assigns topic, tags, summary, sentiment
        // Respects user's autoAnalyze setting and daily quota
        (async () => {
            try {
                const user = await User.findById(req.userId);
                if (user?.aiSettings?.autoAnalyze === false) return;
                const quota = await checkAiQuota(req.userId);
                if (!quota.allowed) return;

                const analysis = await analyzePost(postText);
                const update = { aiAnalyzed: true };
                if (analysis.topic) update.topic = analysis.topic;
                if (analysis.keywords?.length > 0) update.keywords = analysis.keywords;
                if (analysis.summary) update.summary = analysis.summary;
                if (analysis.sentiment) update.sentiment = analysis.sentiment;
                if (analysis.tags?.length > 0) {
                    const existingTags = new Set(post.tags || []);
                    analysis.tags.forEach(t => existingTags.add(t));
                    update.tags = [...existingTags];
                }
                await Post.findByIdAndUpdate(post._id, update);
            } catch (err) {
                console.error("Background AI analysis failed:", err.message);
            }
        })();

        res.status(201).json(post);
    } catch (err) {
        res.status(500).json({ error: "Failed to save post" });
    }
});

// Get all posts
router.get("/", async (req, res) => {
    try {
        const { page = 1, limit = 20, sort = "-dateSaved" } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [posts, total] = await Promise.all([
            Post.find({ userId: req.userId }).sort(sort).skip(skip).limit(parseInt(limit)),
            Post.countDocuments({ userId: req.userId }),
        ]);

        res.json({
            posts,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch posts" });
    }
});

// Search posts — uses $text index for relevance scoring, regex fallback for filters
router.get("/search", async (req, res) => {
    try {
        const { q, author, topic, tag, sentiment, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const filter = { userId: req.userId };
        let useTextScore = false;

        if (q) {
            // Try $text search first for relevance scoring (works on postText + authorName index)
            // Falls back to regex for partial/substring matching
            const hasFilters = author || topic || tag || sentiment;
            if (!hasFilters && q.split(/\s+/).every(w => w.length >= 3)) {
                // Full-word query without filters — use $text for ranked results
                filter.$text = { $search: q };
                useTextScore = true;
            } else {
                // Partial match or has filters — use regex
                const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                filter.$or = [
                    { postText: { $regex: escaped, $options: "i" } },
                    { authorName: { $regex: escaped, $options: "i" } },
                    { topic: { $regex: escaped, $options: "i" } },
                    { tags: { $regex: escaped, $options: "i" } },
                    { keywords: { $regex: escaped, $options: "i" } },
                    { summary: { $regex: escaped, $options: "i" } },
                ];
            }
        }
        if (author) {
            filter.authorName = { $regex: author, $options: "i" };
        }
        if (topic) {
            filter.topic = { $regex: topic, $options: "i" };
        }
        if (tag) {
            filter.tags = { $regex: tag, $options: "i" };
        }
        if (sentiment) {
            filter.sentiment = sentiment;
        }

        let query = Post.find(filter);
        if (useTextScore) {
            query = query.select({ score: { $meta: "textScore" } }).sort({ score: { $meta: "textScore" } });
        } else {
            query = query.sort({ dateSaved: -1 });
        }

        const [posts, total] = await Promise.all([
            query.skip(skip).limit(parseInt(limit)),
            Post.countDocuments(filter),
        ]);

        res.json({
            posts,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
        });
    } catch (err) {
        // If $text search fails (e.g., index issue), retry with regex
        if (err.message?.includes("text index")) {
            try {
                const { q, author, topic, tag, sentiment, page = 1, limit = 20 } = req.query;
                const skip = (parseInt(page) - 1) * parseInt(limit);
                const filter = { userId: req.userId };
                if (q) {
                    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    filter.$or = [
                        { postText: { $regex: escaped, $options: "i" } },
                        { authorName: { $regex: escaped, $options: "i" } },
                    ];
                }
                const [posts, total] = await Promise.all([
                    Post.find(filter).sort({ dateSaved: -1 }).skip(skip).limit(parseInt(limit)),
                    Post.countDocuments(filter),
                ]);
                return res.json({ posts, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
            } catch {}
        }
        console.error("Search error:", err.message);
        res.status(500).json({ error: "Search failed" });
    }
});

// AI-powered semantic search
router.get("/search/ai", async (req, res) => {
    try {
        const { q, page = 1, limit = 20 } = req.query;
        if (!q) return res.status(400).json({ error: "Query is required" });

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const baseFilter = { userId: req.userId };

        // Step 1: Always do a direct search with the original query first
        // This ensures the user's actual words are matched
        const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const directFilter = {
            ...baseFilter,
            $or: [
                { postText: { $regex: escapedQ, $options: "i" } },
                { authorName: { $regex: escapedQ, $options: "i" } },
                { topic: { $regex: escapedQ, $options: "i" } },
                { tags: { $regex: escapedQ, $options: "i" } },
                { keywords: { $regex: escapedQ, $options: "i" } },
                { summary: { $regex: escapedQ, $options: "i" } },
            ],
        };

        // Also search individual words from the original query (min 3 chars)
        const queryWords = q
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length >= 3);
        for (const word of queryWords) {
            const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            directFilter.$or.push(
                { postText: { $regex: esc, $options: "i" } },
                { tags: { $regex: esc, $options: "i" } },
                { keywords: { $regex: esc, $options: "i" } },
            );
        }

        const [directPosts, directTotal] = await Promise.all([
            Post.find(directFilter).sort({ dateSaved: -1 }).skip(skip).limit(parseInt(limit)),
            Post.countDocuments(directFilter),
        ]);

        // Step 2: If we got enough results from direct search, return them
        // Only use AI expansion if direct search finds few or no results
        if (directTotal >= 3) {
            return res.json({
                posts: directPosts,
                total: directTotal,
                page: parseInt(page),
                totalPages: Math.ceil(directTotal / parseInt(limit)),
                aiTerms: queryWords,
                aiTopics: [],
            });
        }

        // Step 3: Try AI-expanded search for broader results
        const { terms, topics, sentiment } = await generateSearchTerms(q);

        const orConditions = [...directFilter.$or]; // keep original query conditions

        // Add AI terms, but only search in the most relevant fields
        for (const term of terms) {
            const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            orConditions.push(
                { postText: { $regex: escaped, $options: "i" } },
                { topic: { $regex: escaped, $options: "i" } },
                { tags: { $regex: escaped, $options: "i" } },
                { keywords: { $regex: escaped, $options: "i" } },
            );
        }

        for (const t of topics) {
            const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            orConditions.push({ topic: { $regex: escaped, $options: "i" } });
        }

        const expandedFilter = { ...baseFilter, $or: orConditions };

        const [posts, total] = await Promise.all([
            Post.find(expandedFilter).sort({ dateSaved: -1 }).skip(skip).limit(parseInt(limit)),
            Post.countDocuments(expandedFilter),
        ]);

        res.json({
            posts,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            aiTerms: terms,
            aiTopics: topics,
        });
    } catch (err) {
        console.error("AI search error:", err.message);
        // On any failure, fall back to plain regex search with original query
        try {
            const { q, page = 1, limit = 20 } = req.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const filter = {
                userId: req.userId,
                $or: [
                    { postText: { $regex: escaped, $options: "i" } },
                    { authorName: { $regex: escaped, $options: "i" } },
                    { topic: { $regex: escaped, $options: "i" } },
                    { tags: { $regex: escaped, $options: "i" } },
                    { keywords: { $regex: escaped, $options: "i" } },
                ],
            };
            const [posts, total] = await Promise.all([
                Post.find(filter).sort({ dateSaved: -1 }).skip(skip).limit(parseInt(limit)),
                Post.countDocuments(filter),
            ]);
            return res.json({
                posts,
                total,
                page: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                aiTerms: [q],
                aiTopics: [],
            });
        } catch {
            res.status(500).json({ error: "AI search failed" });
        }
    }
});

// Group posts by author / topic / date / tags
router.get("/group/:by", async (req, res) => {
    try {
        const { by } = req.params;
        const validGroups = ["author", "topic", "date", "tags", "sentiment", "engagement"];
        if (!validGroups.includes(by)) {
            return res.status(400).json({ error: `Invalid group. Use: ${validGroups.join(", ")}` });
        }

        const matchStage = {
            $match: { userId: new mongoose.Types.ObjectId(req.userId) },
        };

        let pipeline = [matchStage];

        switch (by) {
            case "author":
                pipeline.push(
                    { $group: { _id: "$authorName", count: { $sum: 1 }, posts: { $push: "$$ROOT" } } },
                    { $sort: { count: -1 } },
                );
                break;
            case "topic":
                pipeline.push(
                    { $group: { _id: "$topic", count: { $sum: 1 }, posts: { $push: "$$ROOT" } } },
                    { $sort: { count: -1 } },
                );
                break;
            case "date":
                pipeline.push(
                    {
                        $group: {
                            _id: { $dateToString: { format: "%Y-%m-%d", date: "$dateSaved" } },
                            count: { $sum: 1 },
                            posts: { $push: "$$ROOT" },
                        },
                    },
                    { $sort: { _id: -1 } },
                );
                break;
            case "tags":
                pipeline.push(
                    { $addFields: { allTags: "$tags" } },
                    { $unwind: { path: "$tags", preserveNullAndEmptyArrays: false } },
                    { $group: { _id: "$tags", count: { $sum: 1 }, posts: { $push: "$$ROOT" } } },
                    { $sort: { count: -1 } },
                );
                break;
            case "sentiment":
                pipeline.push(
                    { $match: { sentiment: { $ne: "" } } },
                    { $group: { _id: "$sentiment", count: { $sum: 1 }, posts: { $push: "$$ROOT" } } },
                    { $sort: { count: -1 } },
                );
                break;
            case "engagement":
                pipeline.push(
                    {
                        $addFields: {
                            totalEngagement: {
                                $add: [
                                    { $ifNull: ["$engagement.likes", 0] },
                                    { $ifNull: ["$engagement.comments", 0] },
                                    { $ifNull: ["$engagement.reposts", 0] },
                                ],
                            },
                        },
                    },
                    {
                        $addFields: {
                            engagementLevel: {
                                $switch: {
                                    branches: [
                                        { case: { $gte: ["$totalEngagement", 100] }, then: "High (100+)" },
                                        { case: { $gte: ["$totalEngagement", 20] }, then: "Medium (20-99)" },
                                        { case: { $gte: ["$totalEngagement", 1] }, then: "Low (1-19)" },
                                    ],
                                    default: "None",
                                },
                            },
                        },
                    },
                    {
                        $group: {
                            _id: "$engagementLevel",
                            count: { $sum: 1 },
                            posts: { $push: "$$ROOT" },
                        },
                    },
                    { $sort: { count: -1 } },
                );
                break;
        }

        const groups = await Post.aggregate(pipeline);
        res.json({ groupBy: by, groups });
    } catch (err) {
        res.status(500).json({ error: "Grouping failed" });
    }
});

// Update engagement by postUrl (used by extension when scrolling past saved posts)
router.patch("/engagement-by-url", async (req, res) => {
    try {
        const { postUrl, engagement } = req.body;
        if (!postUrl || !engagement) {
            return res.status(400).json({ error: "postUrl and engagement are required" });
        }
        // Normalize URL — try with and without trailing slash
        const urlClean = postUrl.replace(/\/+$/, "");
        const post = await Post.findOne({
            userId: req.userId,
            $or: [{ postUrl: urlClean }, { postUrl: urlClean + "/" }],
        });
        if (!post) return res.status(404).json({ error: "Post not found" });
        post.engagement = {
            likes: parseInt(engagement.likes) || 0,
            comments: parseInt(engagement.comments) || 0,
            reposts: parseInt(engagement.reposts) || 0,
        };
        await post.save();
        res.json({ updated: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to update engagement" });
    }
});

// Update post tags
router.patch("/:id/tags", async (req, res) => {
    try {
        const { tags } = req.body;
        const post = await Post.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, { tags }, { new: true });
        if (!post) return res.status(404).json({ error: "Post not found" });
        res.json(post);
    } catch (err) {
        res.status(500).json({ error: "Failed to update tags" });
    }
});

// Delete a post
router.delete("/:id", async (req, res) => {
    try {
        const post = await Post.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        if (!post) return res.status(404).json({ error: "Post not found" });
        res.json({ message: "Post deleted" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete post" });
    }
});

// Re-analyze a post with Ollama (rate-limited)
router.post("/:id/analyze", aiLimiter, async (req, res) => {
    try {
        const quota = await checkAiQuota(req.userId);
        if (!quota.allowed) {
            return res.status(429).json({
                error: `Daily AI limit reached (${quota.limit}/day). Adjust in Settings or try tomorrow.`,
                remaining: 0,
                limit: quota.limit,
            });
        }

        const post = await Post.findOne({ _id: req.params.id, userId: req.userId });
        if (!post) return res.status(404).json({ error: "Post not found" });

        const analysis = await analyzePost(post.postText);
        post.topic = analysis.topic || post.topic;
        post.keywords = analysis.keywords?.length > 0 ? analysis.keywords : post.keywords;
        post.summary = analysis.summary || post.summary;
        post.sentiment = analysis.sentiment || post.sentiment;
        if (analysis.tags?.length > 0) {
            const allTags = new Set(post.tags || []);
            analysis.tags.forEach(t => allTags.add(t));
            post.tags = [...allTags];
        }
        post.aiAnalyzed = true;
        await post.save();

        res.json({ ...post.toObject(), aiRemaining: quota.remaining });
    } catch (err) {
        res.status(500).json({ error: "Analysis failed" });
    }
});

// Batch analyze unanalyzed posts (rate-limited)
router.post("/analyze-batch", aiLimiter, async (req, res) => {
    try {
        const posts = await Post.find({ userId: req.userId, aiAnalyzed: false }).limit(10);
        if (posts.length === 0) {
            return res.json({ analyzed: 0, message: "All posts are already analyzed" });
        }

        let analyzed = 0;
        for (const post of posts) {
            // Check quota for each analysis
            const quota = await checkAiQuota(req.userId);
            if (!quota.allowed) {
                return res.json({
                    analyzed,
                    total: posts.length,
                    message: `Stopped at ${analyzed}/${posts.length} — daily AI limit reached (${quota.limit}/day).`,
                });
            }

            try {
                const analysis = await analyzePost(post.postText);
                post.topic = analysis.topic || post.topic;
                post.keywords = analysis.keywords?.length > 0 ? analysis.keywords : post.keywords;
                post.summary = analysis.summary || post.summary;
                post.sentiment = analysis.sentiment || post.sentiment;
                if (analysis.tags?.length > 0) {
                    const allTags = new Set(post.tags || []);
                    analysis.tags.forEach(t => allTags.add(t));
                    post.tags = [...allTags];
                }
                post.aiAnalyzed = true;
                await post.save();
                analyzed++;
            } catch {}
        }

        res.json({ analyzed, total: posts.length });
    } catch (err) {
        res.status(500).json({ error: "Batch analysis failed" });
    }
});

module.exports = router;
