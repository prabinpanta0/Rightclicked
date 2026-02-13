const axios = require("axios");

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;
const SCORE_THRESHOLD = 0.5;

async function verifyRecaptcha(req, res, next) {
    // Skip if reCAPTCHA is not configured (dev mode)
    if (!RECAPTCHA_SECRET) {
        return next();
    }

    const token = req.body.recaptchaToken;
    if (!token) {
        return res.status(400).json({ error: "reCAPTCHA verification required" });
    }

    try {
        const { data } = await axios.post("https://www.google.com/recaptcha/api/siteverify", null, {
            params: {
                secret: RECAPTCHA_SECRET,
                response: token,
            },
        });

        if (!data.success || data.score < SCORE_THRESHOLD) {
            return res.status(403).json({ error: "reCAPTCHA verification failed" });
        }

        next();
    } catch {
        return res.status(500).json({ error: "reCAPTCHA verification error" });
    }
}

module.exports = verifyRecaptcha;
