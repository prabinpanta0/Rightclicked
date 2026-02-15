import { useEffect, useState } from "react";
import { batchAnalyze, getAnalyticsDashboard } from "../api";

export default function Analytics() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const res = await getAnalyticsDashboard();
            setData(res.data);
        } catch {
            /* ignore */
        }
        setLoading(false);
    }

    useEffect(() => {
        load();
    }, []);

    async function handleBatchAnalyze() {
        setAnalyzing(true);
        try {
            await batchAnalyze();
            await load();
        } catch {
            /* ignore */
        }
        setAnalyzing(false);
    }

    if (loading) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-8">
                <div className="text-center py-12 text-muted text-sm">Loading analytics...</div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-8">
                <div className="text-center py-12 text-muted">Could not load analytics</div>
            </div>
        );
    }

    const successRate = data.saveSuccessRate != null ? data.saveSuccessRate.toFixed(1) : "—";
    const avgTime = data.avgTimeToSaveMs != null ? (data.avgTimeToSaveMs / 1000).toFixed(1) : "—";
    const lastLogin = data.lastLogin ? new Date(data.lastLogin).toLocaleDateString() : "—";
    const memberSince = data.memberSince ? new Date(data.memberSince).toLocaleDateString() : "—";

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <h1 className="text-xl font-semibold text-body mb-6">Analytics</h1>

            {/* Key metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                <Stat label="Save success rate" value={`${successRate}%`} />
                <Stat label="Avg time to save" value={`${avgTime}s`} />
                <Stat label="Searches (30d)" value={data.searchCount ?? 0} />
                <Stat label="Sessions (7d)" value={data.weeklySessions ?? 0} />
            </div>

            {/* Account info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                <Stat label="Total posts" value={data.totalPosts ?? 0} />
                <Stat label="Unanalyzed" value={data.unanalyzedPosts ?? 0} />
                <Stat label="Last login" value={lastLogin} />
                <Stat label="Member since" value={memberSince} />
            </div>

            {/* Batch analyze */}
            {data.unanalyzedPosts > 0 && (
                <div className="mb-8 p-4 bg-accent border border-border rounded-xl flex items-center justify-between">
                    <div>
                        <p className="text-sm text-body font-medium">{data.unanalyzedPosts} posts need AI analysis</p>
                        <p className="text-xs text-muted mt-0.5">
                            Analyze up to 10 posts at a time to generate topics and sentiment
                        </p>
                    </div>
                    <button
                        onClick={handleBatchAnalyze}
                        disabled={analyzing}
                        className="px-4 py-2 text-sm bg-linkedin text-white rounded-md hover:opacity-90 disabled:opacity-50"
                    >
                        {analyzing ? "Analyzing..." : "Analyze now"}
                    </button>
                </div>
            )}

            {/* Daily saves chart */}
            {data.dailySaves?.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-sm font-medium text-body mb-3">Daily saves (last 30 days)</h2>
                    <div className="flex items-end gap-px h-24">
                        {data.dailySaves.map((d, i) => {
                            const max = Math.max(...data.dailySaves.map(x => x.count), 1);
                            const h = (d.count / max) * 100;
                            return (
                                <div
                                    key={i}
                                    className="flex-1 bg-linkedin/20 hover:bg-linkedin/40 rounded-t transition-colors relative group"
                                    style={{ height: `${Math.max(h, 2)}%` }}
                                >
                                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center text-[10px] bg-surface border border-border rounded-lg px-2 py-1 whitespace-nowrap shadow-sm z-10">
                                        <span className="text-body font-medium">
                                            {d.count} {d.count === 1 ? "post" : "posts"}
                                        </span>
                                        <span className="text-muted">{d._id}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Two-column: top authors + topic distribution */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {data.topAuthors?.length > 0 && (
                    <div>
                        <h2 className="text-sm font-medium text-body mb-3">Top authors</h2>
                        <ul className="space-y-1.5">
                            {data.topAuthors.map((a, i) => (
                                <li key={i} className="flex items-center justify-between text-sm">
                                    <span className="text-body truncate mr-2">{a._id || "Unknown"}</span>
                                    <span className="text-muted text-xs shrink-0">{a.count} posts</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {data.topicDistribution?.length > 0 && (
                    <div>
                        <h2 className="text-sm font-medium text-body mb-3">Topic distribution</h2>
                        <ul className="space-y-1.5">
                            {data.topicDistribution.map((t, i) => (
                                <li key={i} className="flex items-center justify-between text-sm">
                                    <span className="text-body truncate mr-2">{t._id || "Uncategorized"}</span>
                                    <span className="text-muted text-xs shrink-0">{t.count} posts</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}

function Stat({ label, value }) {
    return (
        <div className="bg-surface border border-border rounded-xl p-3">
            <p className="text-xs text-muted mb-1">{label}</p>
            <p className="text-lg font-semibold text-body">{value}</p>
        </div>
    );
}
