const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        authorName: {
            type: String,
            required: true,
            trim: true,
        },
        authorUrl: {
            type: String,
            trim: true,
            default: "",
        },
        postText: {
            type: String,
            required: true,
        },
        postUrl: {
            type: String,
            trim: true,
            default: "",
        },
        timestamp: {
            type: String,
            default: "",
        },
        dateSaved: {
            type: Date,
            default: Date.now,
            index: true,
        },
        engagement: {
            likes: { type: Number, default: 0 },
            comments: { type: Number, default: 0 },
            reposts: { type: Number, default: 0 },
        },
        topic: {
            type: String,
            default: "",
            index: true,
        },
        keywords: [
            {
                type: String,
                trim: true,
            },
        ],
        tags: [
            {
                type: String,
                trim: true,
            },
        ],
        summary: {
            type: String,
            default: "",
        },
        sentiment: {
            type: String,
            default: "",
        },
        aiAnalyzed: {
            type: Boolean,
            default: false,
        },
        // Post content images fetched from the browser's disk cache
        // and stored as base64 data-URIs.  Each entry also preserves the
        // original CDN URL and the img element's alt text (useful for AI
        // keyword extraction and accessibility display).
        images: [
            {
                url: { type: String, default: "" },
                base64: { type: String, default: "" },
                alt: { type: String, default: "" },
                mimeType: { type: String, default: "" },
            },
        ],
    },
    {
        timestamps: true,
    },
);

postSchema.index({ postText: "text", authorName: "text" });
postSchema.index({ userId: 1, dateSaved: -1 });
postSchema.index({ userId: 1, topic: 1 });
postSchema.index({ userId: 1, authorName: 1 });
postSchema.index({ userId: 1, tags: 1 });

module.exports = mongoose.model("Post", postSchema);
