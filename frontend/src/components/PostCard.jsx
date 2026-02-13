import { useState } from "react";
import { usePostStore } from "../store/usePostStore";

const SENTIMENT_STYLES = {
    educational: "bg-blue-50 text-blue-600",
    inspirational: "bg-yellow-50 text-yellow-600",
    controversial: "bg-red-50 text-red-600",
    promotional: "bg-purple-50 text-purple-600",
    hiring: "bg-green-50 text-green-600",
    opinion: "bg-orange-50 text-orange-600",
    news: "bg-cyan-50 text-cyan-600",
    personal_story: "bg-pink-50 text-pink-600",
};

export default function PostCard({ post }) {
    const { removePost, updateTags, reanalyze } = usePostStore();
    const [expanded, setExpanded] = useState(false);
    const [tagInput, setTagInput] = useState("");
    const [showTagInput, setShowTagInput] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);

    const textPreview = post.postText?.length > 200 && !expanded ? post.postText.slice(0, 200) + "..." : post.postText;
    const authorDisplay = post.authorName || "Unknown Author";
    const sentimentStyle = SENTIMENT_STYLES[post.sentiment] || "bg-gray-50 text-gray-600";
    // After $unwind in tags grouping, post.tags becomes a string -- use allTags (original array) if available
    const tags = Array.isArray(post.allTags)
        ? post.allTags
        : Array.isArray(post.tags)
          ? post.tags
          : post.tags
            ? [post.tags]
            : [];

    function handleAddTag(e) {
        e.preventDefault();
        const tag = tagInput.trim().toLowerCase();
        if (tag && !tags.includes(tag)) {
            updateTags(post._id, [...tags, tag]);
        }
        setTagInput("");
        setShowTagInput(false);
    }

    function handleRemoveTag(tag) {
        updateTags(
            post._id,
            tags.filter(t => t !== tag),
        );
    }

    async function handleAnalyze() {
        setAnalyzing(true);
        try {
            await reanalyze(post._id);
        } finally {
            setAnalyzing(false);
        }
    }

    return (
        <div className="bg-white border border-border rounded-lg p-4 hover:border-gray-300 transition-colors">
            {/* Header: Author + time */}
            <div className="flex items-start justify-between mb-2">
                <div>
                    <div className="flex items-center gap-1.5">
                        {post.authorUrl ? (
                            <a
                                href={post.authorUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-semibold text-body hover:text-linkedin"
                            >
                                {authorDisplay}
                            </a>
                        ) : (
                            <span className="text-sm font-semibold text-body">{authorDisplay}</span>
                        )}
                        <span className="text-xs text-muted">
                            &middot; {post.timestamp || `Saved ${new Date(post.dateSaved).toLocaleDateString()}`}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {post.postUrl && (
                        <a
                            href={post.postUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted hover:text-linkedin transition-colors"
                        >
                            Open on LinkedIn
                        </a>
                    )}
                    <button
                        onClick={() => removePost(post._id)}
                        className="text-xs text-muted hover:text-red-600 transition-colors"
                    >
                        Delete
                    </button>
                </div>
            </div>

            {/* Summary / TL;DR */}
            {post.summary && (
                <div className="mb-2 px-3 py-2 bg-gray-50 border-l-2 border-border rounded-r text-sm text-muted">
                    {post.summary}
                </div>
            )}

            {/* Post Text */}
            <p
                className="text-sm text-body/80 leading-relaxed whitespace-pre-line cursor-pointer mb-3"
                onClick={() => setExpanded(!expanded)}
            >
                {textPreview}
                {post.postText?.length > 200 && !expanded && <span className="text-linkedin ml-1">read more</span>}
            </p>

            {/* Chips row: tags, topic, sentiment */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {tags.map(tag => (
                    <span
                        key={tag}
                        className="px-2 py-0.5 text-xs bg-gray-100 text-muted rounded inline-flex items-center gap-1"
                    >
                        #{tag}
                        <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-500 ml-0.5 text-[10px]">
                            x
                        </button>
                    </span>
                ))}
                {post.keywords?.map(kw => (
                    <span key={kw} className="px-2 py-0.5 text-xs bg-gray-100 text-muted rounded">
                        {kw}
                    </span>
                ))}
            </div>

            {/* Meta row: topic + sentiment + engagement */}
            <div className="flex items-center justify-between text-xs mb-2">
                <div className="flex items-center gap-3">
                    {post.topic && (
                        <span className="text-muted">
                            Topic: <span className="text-body">{post.topic}</span>
                        </span>
                    )}
                    {(post.engagement?.likes > 0 || post.engagement?.comments > 0 || post.engagement?.reposts > 0) && (
                        <span className="text-muted">
                            {post.engagement.likes > 0 && `${post.engagement.likes} likes`}
                            {post.engagement.likes > 0 && post.engagement.comments > 0 && " · "}
                            {post.engagement.comments > 0 && `${post.engagement.comments} comments`}
                            {(post.engagement.likes > 0 || post.engagement.comments > 0) &&
                                post.engagement.reposts > 0 &&
                                " · "}
                            {post.engagement.reposts > 0 && `${post.engagement.reposts} reposts`}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {!post.aiAnalyzed && (
                        <span className="px-2 py-0.5 text-xs bg-amber-50 text-amber-600 rounded">Needs analysis</span>
                    )}
                    {post.sentiment && (
                        <span className={`px-2 py-0.5 text-xs rounded ${sentimentStyle}`}>
                            {post.sentiment.replace("_", " ")}
                        </span>
                    )}
                </div>
            </div>

            {/* Actions row */}
            <div className="flex items-center gap-3 text-xs text-muted border-t border-gray-100 pt-2">
                <button
                    onClick={() => setShowTagInput(!showTagInput)}
                    className="hover:text-linkedin transition-colors"
                >
                    + Tag
                </button>
                <button
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    className="hover:text-linkedin transition-colors disabled:opacity-50"
                >
                    {analyzing ? "Analyzing..." : post.aiAnalyzed ? "Re-analyze" : "Analyze"}
                </button>
            </div>

            {showTagInput && (
                <form onSubmit={handleAddTag} className="mt-2 flex gap-2">
                    <input
                        type="text"
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        placeholder="Add tag..."
                        className="flex-1 px-3 py-1.5 text-sm border border-border rounded focus:outline-none focus:border-linkedin"
                        autoFocus
                    />
                    <button
                        type="submit"
                        className="px-3 py-1.5 text-sm bg-linkedin text-white rounded hover:bg-linkedin-dark"
                    >
                        Add
                    </button>
                </form>
            )}
        </div>
    );
}
