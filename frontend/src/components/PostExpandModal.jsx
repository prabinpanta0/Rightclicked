import { useEffect } from "react";

// ── Sentiment config (shared with PostCard) ─────────────────
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

function humanNumber(n) {
    if (!n || n === 0) return null;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
}

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

// ── Close icon ──────────────────────────────────────────────
const CloseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
);

const LinkedInIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
);

export default function PostExpandModal({ post, onClose }) {
    // Lock body scroll & Escape key
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        function handleKey(e) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("keydown", handleKey);
        return () => {
            document.body.style.overflow = prev;
            document.removeEventListener("keydown", handleKey);
        };
    }, [onClose]);

    if (!post) return null;

    const authorDisplay = post.authorName || "Unknown Author";
    const sentimentCfg = SENTIMENT_CONFIG[post.sentiment] || SENTIMENT_DEFAULT;
    const timeDisplay = post.timestamp ? relativeTime(post.timestamp) : `Saved ${relativeTime(post.dateSaved)}`;

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
    const allKeywords = [...new Set([...(post.keywords || []), ...extractedHashtags])];

    const likesStr = humanNumber(post.engagement?.likes);
    const commentsStr = humanNumber(post.engagement?.comments);
    const repostsStr = humanNumber(post.engagement?.reposts);
    const hasEngagement = likesStr || commentsStr || repostsStr;

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            {/* Modal */}
            <div
                className="relative bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95"
                onClick={e => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1.5 rounded-lg text-muted hover:text-body hover:bg-surface-hover transition-colors z-10"
                    title="Close (Esc)"
                >
                    <CloseIcon />
                </button>

                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-linear-to-br from-linkedin/20 to-linkedin/40 flex items-center justify-center text-linkedin font-bold text-lg shrink-0">
                            {authorDisplay.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                {post.authorUrl ? (
                                    <a
                                        href={post.authorUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-bold text-base text-body hover:text-linkedin"
                                    >
                                        {authorDisplay}
                                    </a>
                                ) : (
                                    <span className="font-bold text-base text-body">{authorDisplay}</span>
                                )}
                                <span className="text-xs text-muted">&middot; {timeDisplay}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                                {post.topic && (
                                    <span className="text-xs text-muted uppercase tracking-wider font-medium">
                                        {post.topic}
                                    </span>
                                )}
                                {post.sentiment && (
                                    <span
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full ${sentimentCfg.bg} ${sentimentCfg.text}`}
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full ${sentimentCfg.dot}`} />
                                        {post.sentiment.replace("_", " ")}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* AI Summary */}
                {post.summary && (
                    <div className="mx-6 mt-4 px-4 py-3 bg-amber-50/60 border border-amber-200/40 rounded-lg">
                        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">TL;DR</span>
                        <p className="text-sm text-amber-900/80 leading-relaxed italic mt-1">{post.summary}</p>
                    </div>
                )}

                {/* Full post text */}
                <div className="px-6 py-5">
                    <div className="text-sm text-body/90 leading-[1.8]">
                        {paragraphs.map((para, idx) => (
                            <p
                                key={`${post._id || "post"}-modal-p-${idx}`}
                                className="whitespace-pre-line mb-4 last:mb-0"
                            >
                                {para}
                            </p>
                        ))}
                    </div>
                </div>

                {/* Keywords & Hashtags */}
                {allKeywords.length > 0 && (
                    <div className="px-6 pb-4 flex flex-wrap items-center gap-1.5">
                        {allKeywords.map(kw => (
                            <span
                                key={kw}
                                className="px-2.5 py-1 text-[11px] font-medium bg-accent text-linkedin rounded-full"
                            >
                                {kw.startsWith("#") ? kw : `#${kw}`}
                            </span>
                        ))}
                    </div>
                )}

                {/* User tags */}
                {tags.length > 0 && (
                    <div className="px-6 pb-4 flex flex-wrap items-center gap-1.5">
                        {tags.map(tag => (
                            <span
                                key={tag}
                                className="px-2.5 py-1 text-[11px] font-medium bg-surface-raised text-muted rounded-full"
                            >
                                #{tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* Footer — engagement + actions */}
                <div className="px-6 py-3 border-t border-border flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-muted">
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
                        {!hasEngagement && <span className="text-muted">No engagement data</span>}
                    </div>
                    <div className="flex items-center gap-2">
                        {post.postUrl && (
                            <a
                                href={post.postUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-linkedin bg-accent rounded-lg hover:bg-linkedin/10 transition-colors"
                            >
                                <LinkedInIcon />
                                View on LinkedIn
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
