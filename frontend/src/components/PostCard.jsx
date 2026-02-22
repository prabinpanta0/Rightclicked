import { useState } from "react";
import { usePostStore } from "../store/usePostStore";
import PostExpandModal from "./PostExpandModal";

// ── Sentiment → color mapping ──────────────────────────────
const SENTIMENT_CONFIG = {
    educational: { bg: "bg-blue-50", text: "text-blue-600", dot: "bg-blue-500" },
    inspirational: { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-500" },
    controversial: { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500" },
    promotional: { bg: "bg-purple-50", text: "text-purple-600", dot: "bg-purple-500" },
    hiring: { bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-500" },
    opinion: { bg: "bg-orange-50", text: "text-orange-600", dot: "bg-orange-500" },
    news: { bg: "bg-cyan-50", text: "text-cyan-600", dot: "bg-cyan-500" },
    personal_story: { bg: "bg-pink-50", text: "text-pink-600", dot: "bg-pink-500" },
};
const SENTIMENT_DEFAULT = { bg: "bg-surface-raised", text: "text-muted", dot: "bg-gray-400" };

/** Turn raw post text into cleaner, human-readable paragraphs */
function formatPostText(raw) {
    if (!raw) return "";
    let text = raw;
    text = text.replace(/…\s*see more/gi, "").replace(/\.\.\.\s*more/gi, "");
    text = text.replace(/^[-–—•]\s*/gm, "• ");
    text = text.replace(/\r\n?/g, "\n");
    text = text.replace(/\n{3,}/g, "\n\n");
    return text.trim();
}

function getParagraphs(text) {
    if (!text) return [];
    return text
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(Boolean);
}

/** Extract hashtags from text and return { cleaned, hashtags } */
function extractHashtags(text) {
    if (!text) return { cleaned: text, hashtags: [] };
    const hashtagRe = /#([\w]+)/g;
    const hashtags = [];
    let m;
    while ((m = hashtagRe.exec(text)) !== null) {
        const tag = m[1].toLowerCase();
        if (!hashtags.includes(tag)) hashtags.push(tag);
    }
    let cleaned = text
        .replace(/^hashtag\s*$/gim, "")
        .replace(/^#[\w]+\s*$/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    cleaned = cleaned.replace(/(\s*#[\w]+\s*){2,}$/g, "").trim();
    return { cleaned, hashtags };
}

/** Format large numbers nicely: 1200 → "1.2K" */
function humanNumber(n) {
    if (!n || n === 0) return null;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
}

/** Relative time display */
function relativeTime(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date)) return dateStr;
    const diffMs = Date.now() - date.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── SVG Icons (inline, small) ──────────────────────────────
const LinkedInIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
);
const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
        <path
            fillRule="evenodd"
            d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
            clipRule="evenodd"
        />
    </svg>
);

export default function PostCard({ post }) {
    const { removePost, updateTags, reanalyze, silentRefresh } = usePostStore();
    const [expanded, setExpanded] = useState(false);
    const [tagInput, setTagInput] = useState("");
    const [showTagInput, setShowTagInput] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [expandOpen, setExpandOpen] = useState(false);

    const authorDisplay = post.authorName || "Unknown Author";
    const sentimentCfg = SENTIMENT_CONFIG[post.sentiment] || SENTIMENT_DEFAULT;

    const tags = Array.isArray(post.allTags)
        ? post.allTags
        : Array.isArray(post.tags)
          ? post.tags
          : post.tags
            ? [post.tags]
            : [];

    const formatted = formatPostText(post.postText);
    const { cleaned: cleanedText, hashtags: extractedHashtags } = extractHashtags(formatted);
    const paragraphs = getParagraphs(cleanedText);
    const allKeywords = [...new Set([...(post.keywords || []), ...extractedHashtags])].filter(
        kw => !tags.some(t => t.toLowerCase() === kw.toLowerCase().replace(/^#/, "")),
    );
    const textPreview = cleanedText?.length > 280 && !expanded ? cleanedText.slice(0, 280) + "…" : cleanedText;

    const likesStr = humanNumber(post.engagement?.likes);
    const commentsStr = humanNumber(post.engagement?.comments);
    const repostsStr = humanNumber(post.engagement?.reposts);
    const hasEngagement = likesStr || commentsStr || repostsStr;
    const timeDisplay = post.timestamp ? relativeTime(post.timestamp) : `Saved ${relativeTime(post.dateSaved)}`;

    function handleAddTag(e) {
        e.preventDefault();
        const tag = tagInput.trim().toLowerCase();
        if (tag && !tags.includes(tag)) updateTags(post._id, [...tags, tag]);
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
            const result = await reanalyze(post._id);
            // If the AI response was delayed or partial, a silent refresh
            // after a short pause picks up the completed analysis.
            if (result) {
                setTimeout(() => silentRefresh(), 2000);
            }
        } finally {
            setAnalyzing(false);
        }
    }

    return (
        <article className="bg-surface border border-border rounded-xl overflow-hidden hover:border-border/80 hover:shadow-sm transition-all">
            {/* ── Header ── */}
            <div className="flex items-start justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-linear-to-br from-linkedin/20 to-linkedin/40 flex items-center justify-center text-linkedin font-bold text-sm shrink-0">
                        {authorDisplay.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {post.authorUrl ? (
                                <a
                                    href={post.authorUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-bold text-[15px] text-body hover:text-linkedin truncate"
                                >
                                    {authorDisplay}
                                </a>
                            ) : (
                                <span className="font-bold text-[15px] text-body truncate">{authorDisplay}</span>
                            )}
                            <span className="text-xs text-muted shrink-0">&middot; {timeDisplay}</span>
                        </div>
                        {post.topic && (
                            <span className="text-[11px] text-muted uppercase tracking-wider font-medium">
                                {post.topic}
                            </span>
                        )}
                    </div>
                </div>
                {/* Action icons */}
                <div className="flex items-center gap-1 shrink-0 ml-3">
                    {post.postUrl && (
                        <a
                            href={post.postUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open on LinkedIn"
                            className="p-1.5 rounded-md text-muted hover:text-linkedin hover:bg-accent transition-colors"
                        >
                            <LinkedInIcon />
                        </a>
                    )}
                    <button
                        onClick={() => removePost(post._id)}
                        title="Delete post"
                        className="p-1.5 rounded-md text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                        <TrashIcon />
                    </button>
                </div>
            </div>

            {/* ── AI Summary / TL;DR ── */}
            {post.summary && (
                <div className="mx-5 mb-3 px-4 py-3 bg-amber-50/60 border border-amber-200/40 rounded-lg">
                    <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[14px] font-semibold text-amber-700 uppercase tracking-wider">
                            TL;DR:
                            <br />
                        </span>
                    </div>
                    <p className="text-[13px] text-amber-900/80 leading-relaxed italic">{post.summary}</p>
                </div>
            )}

            {/* ── Post Body ── */}
            <div className="px-5 pb-3">
                {expanded ? (
                    <div
                        className="text-sm text-body/85 leading-[1.7] cursor-pointer max-w-prose"
                        onClick={() => setExpanded(false)}
                    >
                        {paragraphs.map((para, idx) => (
                            <p key={`${post._id || "post"}-p-${idx}`} className="whitespace-pre-line mb-3 last:mb-0">
                                {para}
                            </p>
                        ))}
                        {cleanedText?.length > 280 && (
                            <span className="text-linkedin font-medium text-xs hover:underline">show less</span>
                        )}
                    </div>
                ) : (
                    <p
                        className="text-sm text-body/85 leading-[1.7] whitespace-pre-line cursor-pointer max-w-prose"
                        onClick={() => setExpanded(true)}
                    >
                        {textPreview}
                        {cleanedText?.length > 280 && (
                            <span className="text-linkedin font-medium ml-1 text-xs hover:underline">read more</span>
                        )}
                    </p>
                )}
            </div>

            {/* ── Hashtags & Keywords (pills) ── */}
            {allKeywords.length > 0 && (
                <div className="px-5 pb-3 flex flex-wrap items-center gap-1.5">
                    {allKeywords.slice(0, expanded ? allKeywords.length : 6).map(kw => (
                        <span
                            key={kw}
                            className="px-2.5 py-1 text-[11px] font-medium bg-accent text-linkedin rounded-full hover:bg-linkedin/10 transition-colors cursor-default"
                        >
                            {kw.startsWith("#") ? kw : `#${kw}`}
                        </span>
                    ))}
                    {!expanded && allKeywords.length > 6 && (
                        <span className="text-[11px] text-muted">+{allKeywords.length - 6} more</span>
                    )}
                </div>
            )}

            {/* ── User Tags ── */}
            {tags.length > 0 && (
                <div className="px-5 pb-3 flex flex-wrap items-center gap-1.5">
                    {tags.map(tag => (
                        <span
                            key={tag}
                            className="px-2.5 py-1 text-[11px] font-medium bg-surface-raised text-muted rounded-full inline-flex items-center gap-1 hover:bg-border/50 transition-colors"
                        >
                            #{tag}
                            <button
                                onClick={() => handleRemoveTag(tag)}
                                className="hover:text-red-500 ml-0.5 text-[10px] leading-none"
                            >
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {/* ── Engagement + Sentiment bar ── */}
            <div className="px-5 pb-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 text-muted">
                    {hasEngagement && (
                        <>
                            {likesStr && (
                                <span className="flex items-center gap-1">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 16 16"
                                        className="w-3.5 h-3.5"
                                        fill="currentColor"
                                    >
                                        <path d="M8 14s-5.5-3.5-5.5-7A3.5 3.5 0 018 4a3.5 3.5 0 015.5 3c0 3.5-5.5 7-5.5 7z" />
                                    </svg>
                                    {likesStr}
                                </span>
                            )}
                            {commentsStr && (
                                <span className="flex items-center gap-1">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 16 16"
                                        className="w-3.5 h-3.5"
                                        fill="currentColor"
                                    >
                                        <path d="M1 3a2 2 0 012-2h10a2 2 0 012 2v7a2 2 0 01-2 2H5.5L2 15V3z" />
                                    </svg>
                                    {commentsStr}
                                </span>
                            )}
                            {repostsStr && (
                                <span className="flex items-center gap-1">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 16 16"
                                        className="w-3.5 h-3.5"
                                        fill="currentColor"
                                    >
                                        <path d="M11 1l3 3-3 3V5H4v3H2V4a1 1 0 011-1h8V1zM5 15l-3-3 3-3v2h7V8h2v4a1 1 0 01-1 1H5v2z" />
                                    </svg>
                                    {repostsStr}
                                </span>
                            )}
                        </>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {!post.aiAnalyzed && (
                        <span className="px-2.5 py-1 text-[11px] font-medium bg-amber-50 text-amber-600 rounded-full">
                            Needs analysis
                        </span>
                    )}
                    {post.sentiment && (
                        <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full ${sentimentCfg.bg} ${sentimentCfg.text}`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${sentimentCfg.dot}`} />
                            {post.sentiment.replace("_", " ")}
                        </span>
                    )}
                </div>
            </div>

            {/* ── Actions bar ── */}
            <div className="flex items-center gap-1 text-xs border-t border-border px-5 py-2.5">
                <button
                    onClick={() => setShowTagInput(!showTagInput)}
                    className="px-3 py-1.5 rounded-md text-muted hover:text-linkedin hover:bg-accent transition-colors"
                >
                    + Tag
                </button>
                <button
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    className="px-3 py-1.5 rounded-md text-muted hover:text-linkedin hover:bg-accent transition-colors disabled:opacity-50"
                >
                    {analyzing ? "Analyzing…" : post.aiAnalyzed ? "Re-analyze" : "Analyze"}
                </button>
                <button
                    onClick={() => setExpandOpen(true)}
                    title="Expand post"
                    className="ml-auto px-2 py-1.5 font-bold text-muted hover:text-linkedin hover:bg-accent transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 15" className="w-4 h-4" fill="none">
                        <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M1 1H5V2H2.70711L5.85355 5.14645L5.14645 5.85355L2 2.70711V5H1V1ZM12.2929 2H10V1H14V5H13V2.70711L9.85355 5.85355L9.14645 5.14645L12.2929 2ZM5.85355 9.85355L2.70711 13H5V14H1V10H2V12.2929L5.14645 9.14645L5.85355 9.85355ZM9.85355 9.14645L13 12.2929L13 10L14 10L14 14H10V13H12.2929L9.14645 9.85355L9.85355 9.14645Z"
                            fill="currentColor"
                        />
                    </svg>
                </button>
            </div>

            {showTagInput && (
                <form onSubmit={handleAddTag} className="px-5 pb-4 flex gap-2">
                    <input
                        type="text"
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        placeholder="Add tag…"
                        className="flex-1 px-3 py-1.5 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:border-linkedin text-body"
                        autoFocus
                    />
                    <button
                        type="submit"
                        className="px-3 py-1.5 text-sm bg-linkedin text-white rounded-lg hover:bg-linkedin-dark transition-colors"
                    >
                        Add
                    </button>
                </form>
            )}

            {expandOpen && <PostExpandModal post={post} onClose={() => setExpandOpen(false)} />}
        </article>
    );
}
