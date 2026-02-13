import { useState } from "react";
import PostCard from "../components/PostCard";
import { usePostStore } from "../store/usePostStore";

export default function Search() {
    const { posts, total, loading, searchPosts, aiSearch, aiTerms, aiTopics } = usePostStore();
    const [query, setQuery] = useState("");
    const [author, setAuthor] = useState("");
    const [topic, setTopic] = useState("");
    const [tag, setTag] = useState("");
    const [sentiment, setSentiment] = useState("");
    const [searched, setSearched] = useState(false);
    const [useAI, setUseAI] = useState(true);

    function handleSearch(e) {
        e.preventDefault();

        // AI mode: just send the query text for AI interpretation
        if (useAI && query.trim()) {
            aiSearch(query.trim());
            setSearched(true);
            return;
        }

        // Manual mode: structured search with individual filters
        const params = {};
        if (query.trim()) params.q = query.trim();
        if (author.trim()) params.author = author.trim();
        if (topic.trim()) params.topic = topic.trim();
        if (tag.trim()) params.tag = tag.trim();
        if (sentiment) params.sentiment = sentiment;

        if (Object.keys(params).length > 0) {
            searchPosts(params);
            setSearched(true);
        }
    }

    return (
        <div className="max-w-3xl mx-auto px-4 py-8">
            <h1 className="text-xl font-semibold text-body mb-6">Search Posts</h1>

            <form onSubmit={handleSearch} className="bg-white border border-border rounded-lg p-5 mb-6 space-y-3">
                {/* AI/Manual toggle */}
                <div className="flex items-center gap-2 mb-1">
                    <button
                        type="button"
                        onClick={() => setUseAI(true)}
                        className={`px-3 py-1 text-[13px] font-medium rounded border transition-colors ${
                            useAI
                                ? "bg-blue-50 text-linkedin border-linkedin"
                                : "bg-white text-muted border-border hover:border-gray-400"
                        }`}
                    >
                        AI Search
                    </button>
                    <button
                        type="button"
                        onClick={() => setUseAI(false)}
                        className={`px-3 py-1 text-[13px] font-medium rounded border transition-colors ${
                            !useAI
                                ? "bg-blue-50 text-linkedin border-linkedin"
                                : "bg-white text-muted border-border hover:border-gray-400"
                        }`}
                    >
                        Manual Filters
                    </button>
                </div>

                <div>
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder={useAI ? "Describe what you're looking for..." : "Search post text..."}
                        className="w-full px-4 py-2.5 border border-border rounded text-sm focus:outline-none focus:border-linkedin"
                    />
                </div>

                {useAI && (
                    <p className="text-xs text-muted">
                        AI will interpret your query and find related posts by expanding topics, synonyms, and related
                        terms.
                    </p>
                )}

                {/* Manual filters -- only show in manual mode */}
                {!useAI && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <input
                            type="text"
                            value={author}
                            onChange={e => setAuthor(e.target.value)}
                            placeholder="Author name"
                            className="px-3 py-2 border border-border rounded text-sm focus:outline-none focus:border-linkedin"
                        />
                        <input
                            type="text"
                            value={topic}
                            onChange={e => setTopic(e.target.value)}
                            placeholder="Topic"
                            className="px-3 py-2 border border-border rounded text-sm focus:outline-none focus:border-linkedin"
                        />
                        <input
                            type="text"
                            value={tag}
                            onChange={e => setTag(e.target.value)}
                            placeholder="Tag"
                            className="px-3 py-2 border border-border rounded text-sm focus:outline-none focus:border-linkedin"
                        />
                        <select
                            value={sentiment}
                            onChange={e => setSentiment(e.target.value)}
                            className="px-3 py-2 border border-border rounded text-sm focus:outline-none focus:border-linkedin bg-white"
                        >
                            <option value="">Any sentiment</option>
                            <option value="educational">Educational</option>
                            <option value="inspirational">Inspirational</option>
                            <option value="controversial">Controversial</option>
                            <option value="promotional">Promotional</option>
                            <option value="hiring">Hiring</option>
                            <option value="opinion">Opinion</option>
                            <option value="news">News</option>
                            <option value="personal_story">Personal Story</option>
                        </select>
                    </div>
                )}

                <button
                    type="submit"
                    className="w-full py-2.5 bg-linkedin text-white text-sm font-medium rounded hover:bg-linkedin-dark transition-colors"
                >
                    {useAI ? "Search with AI" : "Search"}
                </button>
            </form>

            {loading && (
                <div className="text-center py-12 text-muted text-sm">
                    {useAI ? "AI is analyzing your query..." : "Searching..."}
                </div>
            )}

            {/* Show AI-generated search terms */}
            {!loading && searched && useAI && (aiTerms.length > 0 || aiTopics.length > 0) && (
                <div className="bg-gray-50 border border-border rounded-lg px-4 py-3 mb-4">
                    <p className="text-xs font-medium text-muted mb-1.5">AI expanded your search to include:</p>
                    <div className="flex flex-wrap gap-1.5">
                        {aiTopics.map(t => (
                            <span key={t} className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-linkedin rounded">
                                {t}
                            </span>
                        ))}
                        {aiTerms.map(t => (
                            <span
                                key={t}
                                className="px-2 py-0.5 text-xs bg-white text-muted rounded border border-border"
                            >
                                {t}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {!loading && searched && posts.length === 0 && (
                <div className="text-center py-12 text-muted">No results found</div>
            )}

            {!loading && posts.length > 0 && (
                <div>
                    <p className="text-xs text-muted mb-4">{total} results</p>
                    <div className="space-y-3">
                        {posts.map(post => (
                            <PostCard key={post._id} post={post} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
