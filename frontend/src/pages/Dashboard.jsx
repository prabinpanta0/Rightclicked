import { useEffect } from "react";
import PostCard from "../components/PostCard";
import SearchBar from "../components/SearchBar";
import { usePostStore } from "../store/usePostStore";

export default function Dashboard() {
    const { posts, total, page, totalPages, loading, fetchPosts, searchPosts } = usePostStore();

    useEffect(() => {
        fetchPosts(1);
    }, [fetchPosts]);

    function handleSearch(query) {
        if (query) {
            searchPosts({ q: query });
        } else {
            fetchPosts(1);
        }
    }

    return (
        <div className="max-w-3xl mx-auto px-4 py-8">
            <div className="mb-6">
                <h1 className="text-xl font-semibold text-body mb-4">Saved Posts</h1>
                <SearchBar onSearch={handleSearch} />
                <p className="mt-2 text-xs text-muted">{total} posts saved</p>
            </div>

            {loading && <div className="text-center py-12 text-muted text-sm">Loading...</div>}

            {!loading && posts.length === 0 && (
                <div className="text-center py-12">
                    <p className="text-muted">No saved posts yet</p>
                    <p className="text-muted text-sm mt-1">Use the Rightclicked extension on LinkedIn to save posts</p>
                </div>
            )}

            <div className="space-y-3">
                {posts.map(post => (
                    <PostCard key={post._id} post={post} />
                ))}
            </div>

            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-8">
                    <button
                        onClick={() => fetchPosts(page - 1)}
                        disabled={page <= 1}
                        className="px-3 py-1.5 text-sm border border-border rounded disabled:opacity-40 hover:bg-gray-50 text-body"
                    >
                        Previous
                    </button>
                    <span className="px-3 py-1.5 text-sm text-muted">
                        Page {page} of {totalPages}
                    </span>
                    <button
                        onClick={() => fetchPosts(page + 1)}
                        disabled={page >= totalPages}
                        className="px-3 py-1.5 text-sm border border-border rounded disabled:opacity-40 hover:bg-gray-50 text-body"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
