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

module.exports = { apiLimiter, saveLimiter, authLimiter };
