const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: true,
            minlength: 6,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        lastLogin: {
            type: Date,
            default: null,
        },
        // AI usage tracking
        aiUsage: {
            dailyCount: { type: Number, default: 0 },
            lastReset: { type: Date, default: Date.now },
        },
        // User-configurable AI settings
        aiSettings: {
            dailyLimit: { type: Number, default: 15, min: 0, max: 50 },
            autoAnalyze: { type: Boolean, default: true },
        },
    },
    {
        timestamps: true,
    },
);

userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

userSchema.methods.comparePassword = async function (candidate) {
    return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    return obj;
};

module.exports = mongoose.model("User", userSchema);
