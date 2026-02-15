import { useEffect, useState } from "react";
import PostCard from "../components/PostCard";
import SearchBar from "../components/SearchBar";
import useAutoRefresh from "../hooks/useAutoRefresh";
import { usePostStore } from "../store/usePostStore";

const RefreshIcon = ({ spinning }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className={`w-3.5 h-3.5 transition-transform duration-500 ${spinning ? "animate-spin" : ""}`}
    >
        <path
            fillRule="evenodd"
            d="M15.312 11.424a5.5 5.5 0 01-9.379 2.671l1.49-1.49A.75.75 0 006.893 11H2.75a.75.75 0 00-.75.75v4.143a.75.75 0 001.28.53l1.072-1.071a7.002 7.002 0 0011.735-3.222.75.75 0 00-.775-.706zm-10.624-2.85a5.5 5.5 0 019.376-2.67l-1.49 1.49a.75.75 0 00.53 1.53h4.143a.75.75 0 00.75-.75V2.75a.75.75 0 00-1.281-.53l-1.07 1.07A7.002 7.002 0 004.91 6.573a.75.75 0 00.776.706z"
            clipRule="evenodd"
        />
    </svg>
);

export default function Dashboard() {
    const { posts, total, page, totalPages, loading, fetchPosts, searchPosts, silentRefresh } = usePostStore();
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        fetchPosts(1);
    }, [fetchPosts]);

    // Auto-refresh: polls every 15s, refreshes on tab focus / visibility change
    const refresh = useAutoRefresh(silentRefresh, { interval: 15000 });

    async function handleManualRefresh() {
        setRefreshing(true);
        await silentRefresh();
        // Brief spin animation
        setTimeout(() => setRefreshing(false), 600);
    }

    function handleSearch(query) {
        if (query) {
            searchPosts({ q: query });
        } else {
            fetchPosts(1);
        }
    }

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-xl font-semibold text-body">Saved Posts</h1>
                    <button
                        onClick={handleManualRefresh}
                        title="Refresh posts"
                        className="p-1.5 rounded-md text-muted hover:text-linkedin hover:bg-accent transition-colors"
                    >
                        <RefreshIcon spinning={refreshing} />
                    </button>
                </div>
                <SearchBar onSearch={handleSearch} />
                <p className="mt-2 text-xs text-muted">{total} posts saved</p>
            </div>

            {loading && <div className="text-center py-12 text-muted text-sm">Loading…</div>}

            {!loading && posts.length === 0 && (
                <div className="text-center py-16">
                    <p className="text-muted font-medium">No saved posts yet</p>
                    <p className="text-muted text-sm mt-1">Use the Rightclicked extension on LinkedIn to save posts</p>
                </div>
            )}

            <div className="space-y-4">
                {posts.map(post => (
                    <PostCard key={post._id} post={post} />
                ))}
            </div>

            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-8">
                    <button
                        onClick={() => fetchPosts(page - 1)}
                        disabled={page <= 1}
                        className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40 hover:bg-surface-hover text-body transition-colors"
                    >
                        Previous
                    </button>
                    <span className="px-3 py-1.5 text-sm text-muted">
                        Page {page} of {totalPages}
                    </span>
                    <button
                        onClick={() => fetchPosts(page + 1)}
                        disabled={page >= totalPages}
                        className="px-3 py-1.5 text-sm border border-border rounded-lg disabled:opacity-40 hover:bg-surface-hover text-body transition-colors"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
