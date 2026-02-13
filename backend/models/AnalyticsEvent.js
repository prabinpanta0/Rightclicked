const mongoose = require("mongoose");

const analyticsEventSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        event: {
            type: String,
            required: true,
            enum: [
                "save_attempt",
                "save_success",
                "save_failure",
                "search",
                "ai_search",
                "page_view",
                "session_start",
                "session_heartbeat",
            ],
            index: true,
        },
        meta: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    {
        timestamps: true,
    },
);

analyticsEventSchema.index({ userId: 1, event: 1, createdAt: -1 });
analyticsEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 }); // TTL 90 days

module.exports = mongoose.model("AnalyticsEvent", analyticsEventSchema);
