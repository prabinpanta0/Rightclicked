import { useEffect, useState } from "react";
import { getSettings, updateSettings } from "../api";
import { useAuthStore } from "../store/useAuthStore";
import { useThemeStore } from "../store/useThemeStore";

export default function Settings() {
    const { user, logout } = useAuthStore();
    const { preference, setTheme } = useThemeStore();
    const [aiSettings, setAiSettings] = useState({ dailyLimit: 15, autoAnalyze: true });
    const [aiUsage, setAiUsage] = useState({ used: 0, limit: 15, remaining: 15 });
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        getSettings()
            .then(({ data }) => {
                if (data.aiSettings) setAiSettings(data.aiSettings);
                if (data.aiUsage) setAiUsage(data.aiUsage);
            })
            .catch(() => {});
    }, []);

    async function handleSave() {
        setSaving(true);
        setMessage("");
        try {
            const { data } = await updateSettings(aiSettings);
            if (data.aiSettings) setAiSettings(data.aiSettings);
            if (data.aiUsage) setAiUsage(data.aiUsage);
            setMessage("Settings saved");
            setTimeout(() => setMessage(""), 3000);
        } catch (err) {
            setMessage(err.response?.data?.error || "Failed to save");
        } finally {
            setSaving(false);
        }
    }

    const usagePercent = aiUsage.limit > 0 ? Math.round((aiUsage.used / aiUsage.limit) * 100) : 0;

    return (
        <div className="max-w-xl mx-auto px-4 py-8">
            <h1 className="text-xl font-semibold text-body mb-6">Settings</h1>

            <div className="space-y-6">
                {/* Account */}
                <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
                    <h2 className="text-[11px] font-semibold text-muted uppercase tracking-wider">Account</h2>
                    <div>
                        <p className="text-sm text-body font-medium">{user?.name || "User"}</p>
                        <p className="text-sm text-muted">{user?.email || ""}</p>
                    </div>
                </div>

                {/* Appearance */}
                <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
                    <h2 className="text-[11px] font-semibold text-muted uppercase tracking-wider">Appearance</h2>
                    <div className="flex items-center gap-2">
                        {["light", "dark"].map(opt => (
                            <button
                                key={opt}
                                onClick={() => setTheme(opt)}
                                className={`px-4 py-2 text-sm rounded-lg border transition-colors capitalize ${
                                    preference === opt
                                        ? "bg-accent text-linkedin border-linkedin font-medium"
                                        : "bg-surface text-muted border-border hover:border-muted"
                                }`}
                            >
                                {opt}
                            </button>
                        ))}
                    </div>
                </div>

                {/* AI Settings */}
                <div className="bg-surface border border-border rounded-xl p-6 space-y-5">
                    <h2 className="text-[11px] font-semibold text-muted uppercase tracking-wider">AI Analysis</h2>

                    {/* Usage bar */}
                    <div>
                        <div className="flex items-center justify-between text-sm mb-1.5">
                            <span className="text-body">Today's usage</span>
                            <span className="text-muted">
                                {aiUsage.used} / {aiUsage.limit} analyses
                            </span>
                        </div>
                        <div className="w-full h-2 bg-surface-raised rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${
                                    usagePercent >= 90
                                        ? "bg-red-500"
                                        : usagePercent >= 60
                                          ? "bg-amber-500"
                                          : "bg-linkedin"
                                }`}
                                style={{ width: `${Math.min(usagePercent, 100)}%` }}
                            />
                        </div>
                        <p className="text-xs text-muted mt-1">
                            {aiUsage.remaining} remaining · Resets daily at midnight UTC
                        </p>
                    </div>

                    {/* Daily limit slider */}
                    <div>
                        <label className="flex items-center justify-between text-sm mb-1.5">
                            <span className="text-body">Daily AI limit</span>
                            <span className="text-muted font-mono text-xs">{aiSettings.dailyLimit}/day</span>
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="50"
                            step="5"
                            value={aiSettings.dailyLimit}
                            onChange={e => setAiSettings(prev => ({ ...prev, dailyLimit: parseInt(e.target.value) }))}
                            className="w-full accent-linkedin"
                        />
                        <div className="flex justify-between text-[10px] text-muted mt-0.5">
                            <span>0 (off)</span>
                            <span>15 (default)</span>
                            <span>50 (max)</span>
                        </div>
                    </div>

                    {/* Auto-analyze toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-body">Auto-analyze new posts</p>
                            <p className="text-xs text-muted">Automatically run AI analysis when you save a post</p>
                        </div>
                        <button
                            onClick={() => setAiSettings(prev => ({ ...prev, autoAnalyze: !prev.autoAnalyze }))}
                            className={`relative w-10 h-5 rounded-full transition-colors ${
                                aiSettings.autoAnalyze ? "bg-linkedin" : "bg-border"
                            }`}
                        >
                            <span
                                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                    aiSettings.autoAnalyze ? "translate-x-5" : "translate-x-0"
                                }`}
                            />
                        </button>
                    </div>

                    {/* Save + feedback */}
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-2 text-sm bg-linkedin text-white rounded-lg hover:bg-linkedin-dark transition-colors disabled:opacity-50"
                        >
                            {saving ? "Saving…" : "Save Settings"}
                        </button>
                        {message && (
                            <span
                                className={`text-sm ${message.includes("saved") ? "text-green-600" : "text-red-600"}`}
                            >
                                {message}
                            </span>
                        )}
                    </div>
                </div>

                {/* Extension setup */}
                <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
                    <h2 className="text-[11px] font-semibold text-muted uppercase tracking-wider">Extension Setup</h2>
                    <ol className="text-sm text-body/80 space-y-1 list-decimal list-inside">
                        <li>Open Chrome and go to chrome://extensions</li>
                        <li>Enable Developer mode</li>
                        <li>Click "Load unpacked" and select the extension folder</li>
                        <li>Log in via the extension popup on LinkedIn</li>
                    </ol>
                </div>

                {/* API */}
                <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
                    <h2 className="text-[11px] font-semibold text-muted uppercase tracking-wider">API</h2>
                    <p className="text-sm text-muted">
                        Backend:{" "}
                        <code className="text-xs bg-surface-raised px-1.5 py-0.5 rounded text-body">
                            http://localhost:3001
                        </code>
                    </p>
                </div>

                {/* Logout */}
                <div className="bg-surface border border-border rounded-xl p-6">
                    <button
                        onClick={logout}
                        className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                        Log out
                    </button>
                </div>
            </div>
        </div>
    );
}
