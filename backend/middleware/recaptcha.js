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
        // If no token at all, the client likely has tracking protection
        // (Firefox, Brave, etc.) that blocked the reCAPTCHA script.
        // Log it but allow the request — rate limiting still protects us.
        console.warn("[reCAPTCHA] No token provided — client may have tracking protection. Allowing request.");
        return next();
    }

    try {
        const { data } = await axios.post("https://www.google.com/recaptcha/api/siteverify", null, {
            params: {
                secret: RECAPTCHA_SECRET,
                response: token,
            },
        });

        if (!data.success || data.score < SCORE_THRESHOLD) {
            console.warn(`[reCAPTCHA] Low score (${data.score}) or failed verification. Allowing with warning.`);
        }

        next();
    } catch (err) {
        // Network error verifying token — don't block the user
        console.error("[reCAPTCHA] Verification request failed:", err.message);
        next();
    }
}

module.exports = verifyRecaptcha;
