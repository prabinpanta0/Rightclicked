const rateLimit = require("express-rate-limit");

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Too many requests, please try again later" },
});

const saveLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: "Too many save requests, please slow down" },
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many login attempts, please try again later" },
});

// AI analysis rate limiter — per-IP fallback, but the real per-user limit
// is enforced in the route handler using User.aiUsage counters.
//
// Ollama Cloud free tier budget:
//   ~250k tokens/hour → ~385 analysis calls/hour (at ~650 tokens each)
//   We limit to 20 AI calls/hour per IP to stay well within budget.
//   Per-user daily limit (User.aiSettings.dailyLimit) defaults to 15/day.
const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 AI calls per hour per IP (safe for cloud free tier)
    message: { error: "AI rate limit reached. Try again later." },
});

module.exports = { apiLimiter, saveLimiter, authLimiter, aiLimiter };
