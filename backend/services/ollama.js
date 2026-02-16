// ── Ollama provider config ──────────────────────────────────
// Supports both local Ollama and Ollama Cloud.
//
// Local (default):
//   OLLAMA_BASE_URL=http://localhost:11434  (no API key needed)
//
// Ollama Cloud (free tier — ~250k tokens/hour, then paused):
//   OLLAMA_BASE_URL=https://ollama.com   ← NO trailing /api!
//   OLLAMA_API_KEY=your_ollama_api_key_here
//   OLLAMA_MODEL=gemma3:4b  (small, fast, good at structured JSON)
//
// The code appends /api/generate, so:
//   Local  → http://localhost:11434/api/generate
//   Cloud  → https://ollama.com/api/generate

// let OLLAMA_BASE = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
let OLLAMA_BASE = process.env.OLLAMA_BASE_URL.replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:0.5b";
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || "";

// True when pointing at Ollama Cloud (ollama.com) rather than a local instance
const IS_CLOUD = OLLAMA_BASE.includes("ollama.com");

// Auto-fix common misconfiguration: strip trailing /api if user set it
// (the endpoint path /api/generate is appended by the code)
if (OLLAMA_BASE.endsWith("/api")) {
    console.warn("[AI] ⚠ Stripping trailing /api from OLLAMA_BASE_URL — the code appends /api/generate automatically.");
    OLLAMA_BASE = OLLAMA_BASE.slice(0, -4);
}

// Build headers — add Bearer auth when an API key is present
function buildHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (OLLAMA_API_KEY) {
        headers["Authorization"] = `Bearer ${OLLAMA_API_KEY}`;
    }
    return headers;
}

// Build the request body — works for both local and cloud Ollama.
// Ollama Cloud supports the same /api/generate spec as local Ollama,
// including `format: "json"` and `options`. We include them everywhere.
function buildRequestBody(base, extra = {}) {
    const body = { ...base, model: OLLAMA_MODEL, stream: false };
    body.format = "json";
    if (extra.options) body.options = extra.options;
    return body;
}

// Log provider once at startup
console.log(
    `[AI] Provider: ${IS_CLOUD ? "Ollama Cloud" : "Local Ollama"} | Model: ${OLLAMA_MODEL} | Base: ${OLLAMA_BASE}`,
);

// ── Post analysis prompt ────────────────────────────────────
// Written for small local models (1B–8B). Keeps instructions
// tight, gives a concrete example, and aggressively prevents
// the model from adding conversational filler.

const SYSTEM_PROMPT = `You extract structured data from LinkedIn posts into JSON.

Return this exact shape:
{"topic":"...","tags":["..."],"summary":"...","sentiment":"...","keywords":["..."]}

Fields:

1. "topic" — ONE from: Technology, Business, Career, Leadership, Marketing, Finance, Entrepreneurship, Education, Health, AI & Machine Learning, Personal Development, Industry News, Sustainability, Design, Engineering, Science.

2. "tags" — 3-6 lowercase hyphenated labels (e.g. "remote-work", "series-a", "open-source").

3. "summary" — One short sentence (~20 words), third person. Start with "The author …" or "A post about …".

4. "sentiment" — ONE of: educational, inspirational, controversial, promotional, hiring, opinion, news, personal_story.

5. "keywords" — 4-7 important nouns/phrases from the post (lowercase).

Example:
Input: "Just raised our Series A! $12M to build the future of developer tools. Grateful to our investors and the amazing team."
Output: {"topic":"Entrepreneurship","tags":["fundraising","series-a","developer-tools","startup"],"summary":"The author announces a $12M Series A raise for a developer tools startup.","sentiment":"promotional","keywords":["series a","developer tools","investors","fundraising"]}`;

// ── Robust JSON extraction ──────────────────────────────────
// With format:"json" Ollama constrains output to valid JSON,
// so we only need light cleanup for edge cases (fences, trailing junk).

function extractJSON(raw) {
    if (!raw || typeof raw !== "string") return null;

    // Strategy 1: Direct parse (covers 99% of format:json responses)
    try {
        return JSON.parse(raw.trim());
    } catch {}

    // Strategy 2: Strip markdown code fences (rare with format:json)
    const fenced = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
    try {
        return JSON.parse(fenced);
    } catch {}

    // Strategy 3: Extract first { … } block and trim trailing junk
    const braceMatch = raw.match(/\{[\s\S]*\}/);
    if (braceMatch) {
        try {
            return JSON.parse(braceMatch[0]);
        } catch {}

        let candidate = braceMatch[0];
        const lastBrace = candidate.lastIndexOf("}");
        if (lastBrace !== -1) {
            candidate = candidate.slice(0, lastBrace + 1);
            try {
                return JSON.parse(candidate);
            } catch {}
        }
    }

    return null;
}

// ── Validation ──────────────────────────────────────────────

const VALID_TOPICS = new Set([
    "Technology",
    "Business",
    "Career",
    "Leadership",
    "Marketing",
    "Finance",
    "Entrepreneurship",
    "Education",
    "Health",
    "AI & Machine Learning",
    "Personal Development",
    "Industry News",
    "Sustainability",
    "Design",
    "Engineering",
    "Science",
    "Other",
]);

// Fuzzy topic matching — maps common AI model variations to the canonical topic name
const TOPIC_ALIASES = new Map();
for (const t of VALID_TOPICS) {
    TOPIC_ALIASES.set(t.toLowerCase(), t);
}
// Common variations small models produce
const EXTRA_ALIASES = {
    tech: "Technology",
    ai: "AI & Machine Learning",
    ml: "AI & Machine Learning",
    "machine learning": "AI & Machine Learning",
    "artificial intelligence": "AI & Machine Learning",
    "ai/ml": "AI & Machine Learning",
    "ai and machine learning": "AI & Machine Learning",
    "ai & ml": "AI & Machine Learning",
    "deep learning": "AI & Machine Learning",
    "self improvement": "Personal Development",
    "self-improvement": "Personal Development",
    "personal growth": "Personal Development",
    growth: "Personal Development",
    startup: "Entrepreneurship",
    startups: "Entrepreneurship",
    founder: "Entrepreneurship",
    hiring: "Career",
    jobs: "Career",
    "job search": "Career",
    interview: "Career",
    news: "Industry News",
    industry: "Industry News",
    branding: "Marketing",
    sales: "Marketing",
    ux: "Design",
    ui: "Design",
    "ux design": "Design",
    "product design": "Design",
    healthcare: "Health",
    wellness: "Health",
    "mental health": "Health",
    management: "Leadership",
    investing: "Finance",
    economics: "Finance",
    green: "Sustainability",
    climate: "Sustainability",
    environment: "Sustainability",
    cloud: "Technology",
    "cloud computing": "Technology",
    azure: "Technology",
    aws: "Technology",
    "google cloud": "Technology",
    microsoft: "Technology",
    devops: "Technology",
    cybersecurity: "Technology",
    programming: "Technology",
    software: "Technology",
    "software engineering": "Engineering",
    "data science": "Technology",
    blockchain: "Technology",
    "web development": "Technology",
    certification: "Education",
    certifications: "Education",
    learning: "Education",
    training: "Education",
    course: "Education",
    "online learning": "Education",
    "professional development": "Education",
    achievement: "Personal Development",
    motivation: "Personal Development",
    networking: "Career",
    resume: "Career",
    "job market": "Career",
    promotion: "Career",
    layoff: "Career",
    layoffs: "Career",
    hr: "Business",
    "human resources": "Business",
    strategy: "Business",
    innovation: "Business",
    "product management": "Business",
    "social media": "Marketing",
    advertising: "Marketing",
    "content marketing": "Marketing",
    diversity: "Leadership",
    "company culture": "Leadership",
    "team building": "Leadership",
    crypto: "Finance",
    cryptocurrency: "Finance",
    banking: "Finance",
    "venture capital": "Finance",
    energy: "Sustainability",
    "clean energy": "Sustainability",
    biotech: "Science",
    research: "Science",
    physics: "Science",
    biology: "Science",
};
for (const [alias, canonical] of Object.entries(EXTRA_ALIASES)) {
    TOPIC_ALIASES.set(alias.toLowerCase(), canonical);
}

function matchTopic(raw) {
    if (!raw || typeof raw !== "string") return { topic: "Other", subTopic: "" };
    // Exact match first
    if (VALID_TOPICS.has(raw)) return { topic: raw, subTopic: "" };
    // Case-insensitive match
    const lower = raw.toLowerCase().trim();
    if (TOPIC_ALIASES.has(lower)) return { topic: TOPIC_ALIASES.get(lower), subTopic: "" };
    // Strip common wrapping characters the model might add
    const cleaned = lower.replace(/[^a-z0-9 &/]/g, "").trim();
    if (TOPIC_ALIASES.has(cleaned)) return { topic: TOPIC_ALIASES.get(cleaned), subTopic: "" };
    // Fallback — preserve the hallucinated value so it isn't lost
    return { topic: "Other", subTopic: raw.slice(0, 60).trim() };
}

const VALID_SENTIMENTS = new Set([
    "educational",
    "inspirational",
    "controversial",
    "promotional",
    "hiring",
    "opinion",
    "news",
    "personal_story",
]);

// Truncate a summary to at most maxWords, ending on a sentence boundary when possible.
function truncateSummary(raw, maxWords = 40) {
    if (!raw || typeof raw !== "string") return "";
    const trimmed = raw.trim();
    const words = trimmed.split(/\s+/);
    if (words.length <= maxWords) return trimmed;

    // Take first maxWords words, then look for the last sentence-ending punctuation
    const slice = words.slice(0, maxWords).join(" ");
    const sentenceEnd = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("!"), slice.lastIndexOf("?"));
    if (sentenceEnd > slice.length * 0.4) {
        // Found a sentence boundary past the 40% mark — cut there
        return slice.slice(0, sentenceEnd + 1);
    }
    // No good boundary — return the word-limited slice with ellipsis
    return slice + "…";
}

function validateAndClean(parsed) {
    if (!parsed || typeof parsed !== "object") return null;

    const { topic, subTopic } = matchTopic(parsed.topic);

    let tags = Array.isArray(parsed.tags)
        ? parsed.tags
              .map(t =>
                  String(t)
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, "")
                      .trim(),
              )
              .filter(t => t.length > 1)
              .slice(0, 8)
        : [];

    // If the model hallucinated a topic, preserve it as a tag so the data isn't lost
    if (subTopic) {
        const asTag = subTopic
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");
        if (asTag.length > 1 && !tags.includes(asTag)) {
            tags = [asTag, ...tags].slice(0, 8);
        }
    }

    const summary = truncateSummary(typeof parsed.summary === "string" ? parsed.summary : "");

    const rawSentiment =
        typeof parsed.sentiment === "string"
            ? parsed.sentiment
                  .toLowerCase()
                  .replace(/[^a-z_]/g, "")
                  .trim()
            : "";
    const sentiment = VALID_SENTIMENTS.has(rawSentiment) ? rawSentiment : "";

    const keywords = Array.isArray(parsed.keywords)
        ? parsed.keywords
              .map(k => String(k).toLowerCase().trim())
              .filter(k => k.length > 1)
              .slice(0, 6)
        : [];

    // -- Sparse output recovery --
    // If the model returned fewer than 3 tags, supplement from keywords
    if (tags.length < 3 && keywords.length > 0) {
        for (const kw of keywords) {
            const asTag = kw
                .replace(/[^a-z0-9-]/g, "-")
                .replace(/-+/g, "-")
                .replace(/^-|-$/g, "");
            if (asTag.length > 1 && !tags.includes(asTag)) {
                tags.push(asTag);
                if (tags.length >= 4) break;
            }
        }
    }

    return { topic, tags, summary, sentiment, keywords };
}

// ── Main analysis function (with retry) ─────────────────────

async function analyzePost(postText, retries = IS_CLOUD ? 0 : 2) {
    const trimmed = (postText || "").slice(0, 1500);
    if (trimmed.length < 20) return fallbackAnalysis(postText);

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const body = buildRequestBody(
                {
                    system: SYSTEM_PROMPT,
                    prompt: `Analyze this LinkedIn post and return ONLY the JSON object, nothing else:\n\n${trimmed}`,
                },
                { options: { temperature: 0.2, num_predict: 300, top_p: 0.9 } },
            );

            const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
                method: "POST",
                headers: buildHeaders(),
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(IS_CLOUD ? 8000 : 30000),
            });

            // Cloud free tier: 429 = hourly token budget exhausted
            if (res.status === 429) {
                const retryAfter = res.headers.get("retry-after");
                console.warn(`[AI] Cloud rate limit hit (429). Retry-After: ${retryAfter || "unknown"}s`);
                // Don't retry — wait won't help within this request
                return fallbackAnalysis(postText);
            }

            if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
            const data = await res.json();
            const raw = (data.response || "").trim();

            const parsed = extractJSON(raw);
            if (!parsed) {
                console.warn(`AI parse attempt ${attempt + 1} failed. Raw: ${raw.slice(0, 120)}...`);
                continue;
            }

            const result = validateAndClean(parsed);
            if (result && (result.topic !== "Other" || result.tags.length > 0 || result.summary)) {
                return result;
            }

            console.warn(`AI attempt ${attempt + 1} returned sparse data, retrying...`);
        } catch (err) {
            console.error(`AI analysis attempt ${attempt + 1}:`, err.message);
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, IS_CLOUD ? 500 * (attempt + 1) : 200 * (attempt + 1)));
            }
        }
    }

    console.warn("AI analysis: all attempts failed, using fallback");
    return fallbackAnalysis(postText);
}

// ── Fallback: keyword + topic detection without LLM ─────────

function fallbackAnalysis(postText) {
    const text = (postText || "").toLowerCase();
    const stopWords = new Set([
        "the",
        "a",
        "an",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "shall",
        "can",
        "need",
        "dare",
        "ought",
        "used",
        "to",
        "of",
        "in",
        "for",
        "on",
        "with",
        "at",
        "by",
        "from",
        "as",
        "into",
        "through",
        "during",
        "before",
        "after",
        "above",
        "below",
        "between",
        "out",
        "off",
        "over",
        "under",
        "again",
        "further",
        "then",
        "once",
        "here",
        "there",
        "when",
        "where",
        "why",
        "how",
        "all",
        "each",
        "every",
        "both",
        "few",
        "more",
        "most",
        "other",
        "some",
        "such",
        "no",
        "not",
        "only",
        "own",
        "same",
        "so",
        "than",
        "too",
        "very",
        "just",
        "because",
        "but",
        "and",
        "or",
        "if",
        "while",
        "that",
        "this",
        "it",
        "its",
        "i",
        "my",
        "we",
        "our",
        "you",
        "your",
        "they",
        "them",
        "their",
        "what",
        "which",
        "who",
        "whom",
        "he",
        "she",
        "him",
        "her",
        "his",
        "about",
        "also",
        "get",
        "got",
        "like",
        "make",
        "many",
        "much",
        "new",
        "one",
        "two",
        "way",
        "even",
        "well",
        "back",
        "still",
        "going",
    ]);
    const words = text
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));
    const freq = {};
    words.forEach(w => {
        freq[w] = (freq[w] || 0) + 1;
    });
    const keywords = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([w]) => w);

    const topicRules = [
        {
            topic: "AI & Machine Learning",
            patterns: [
                "ai",
                "machine learning",
                "deep learning",
                "neural",
                "gpt",
                "llm",
                "chatgpt",
                "artificial intelligence",
                "model training",
                "nlp",
            ],
        },
        {
            topic: "Technology",
            patterns: [
                "software",
                "developer",
                "programming",
                "code",
                "api",
                "cloud",
                "devops",
                "saas",
                "tech stack",
                "open-source",
                "github",
            ],
        },
        {
            topic: "Career",
            patterns: [
                "hired",
                "hiring",
                "job",
                "career",
                "interview",
                "resume",
                "laid off",
                "layoff",
                "promotion",
                "salary",
                "remote work",
            ],
        },
        {
            topic: "Entrepreneurship",
            patterns: [
                "startup",
                "founder",
                "fundraising",
                "series a",
                "seed",
                "venture",
                "bootstrapped",
                "co-founder",
                "pitch",
            ],
        },
        {
            topic: "Leadership",
            patterns: ["leadership", "ceo", "manager", "team lead", "culture", "management", "mentor"],
        },
        {
            topic: "Marketing",
            patterns: ["marketing", "brand", "content strategy", "seo", "growth", "social media", "campaign"],
        },
        {
            topic: "Finance",
            patterns: ["finance", "investing", "stock", "revenue", "profit", "valuation", "ipo", "funding"],
        },
        {
            topic: "Personal Development",
            patterns: [
                "productivity",
                "habit",
                "mindset",
                "self-improvement",
                "motivation",
                "learning",
                "growth mindset",
            ],
        },
        {
            topic: "Education",
            patterns: ["education", "university", "course", "student", "learning", "certification", "bootcamp"],
        },
        { topic: "Design", patterns: ["design", "ux", "ui", "figma", "user experience", "prototyp"] },
        { topic: "Engineering", patterns: ["engineering", "infrastructure", "system design", "scalab", "architect"] },
        {
            topic: "Health",
            patterns: ["health", "wellness", "mental health", "burnout", "work-life balance", "fitness"],
        },
    ];

    let topic = "";
    let bestScore = 0;
    for (const rule of topicRules) {
        let score = 0;
        for (const p of rule.patterns) {
            if (text.includes(p)) score++;
        }
        if (score > bestScore) {
            bestScore = score;
            topic = rule.topic;
        }
    }
    if (!topic) topic = "Other";

    let sentiment = "";
    if (/\b(learn|lesson|tip|how to|guide|explained)\b/i.test(text)) sentiment = "educational";
    else if (/\b(inspir|motivat|grateful|proud|achievement)\b/i.test(text)) sentiment = "inspirational";
    else if (/\b(hiring|we.?re hiring|open role|apply now|position)\b/i.test(text)) sentiment = "hiring";
    else if (/\b(launch|announc|excited to share|check out our)\b/i.test(text)) sentiment = "promotional";
    else if (/\b(opinion|unpopular|hot take|disagree|debate)\b/i.test(text)) sentiment = "opinion";
    else if (/\b(breaking|report|according to|study shows)\b/i.test(text)) sentiment = "news";

    return { topic, tags: keywords.slice(0, 3), summary: "", sentiment, keywords };
}

// ── Search term generation prompt ───────────────────────────

const SEARCH_PROMPT = `You are a search-term expansion tool for a LinkedIn post bookmarking app. Given a user's search query, generate relevant search terms that would match saved posts.

Respond with ONLY a JSON object. No other text.

{"terms":["..."],"topics":["..."],"sentiment":"..."}

- "terms": 5-10 specific words/phrases that might appear in LinkedIn posts about this topic (synonyms, abbreviations, related concepts)
- "topics": 1-3 categories from this list: Technology, Business, Career, Leadership, Marketing, Finance, Entrepreneurship, Education, Health, AI & Machine Learning, Personal Development, Industry News, Sustainability, Design, Engineering, Science.
- "sentiment": one of educational/inspirational/controversial/promotional/hiring/opinion/news/personal_story, or "" if unclear

Example:
Input: "startup fundraising tips"
Output: {"terms":["fundraising","startup","series a","seed round","investors","venture capital","vc","pitch deck","raise","funding"],"topics":["Entrepreneurship","Finance"],"sentiment":"educational"}`;

async function generateSearchTerms(query) {
    try {
        const body = buildRequestBody(
            {
                system: SEARCH_PROMPT,
                prompt: `Search query: "${query}"\n\nRespond with ONLY the JSON object, nothing else.`,
            },
            { options: { temperature: 0.3, num_predict: 200 } },
        );

        const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
            method: "POST",
            headers: buildHeaders(),
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(IS_CLOUD ? 8000 : 15000),
        });
        if (res.status === 429) {
            console.warn("[AI] Cloud rate limit hit (429) during search term generation");
            throw new Error("Rate limit exceeded");
        }
        if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
        const data = await res.json();
        const raw = (data.response || "").trim();
        const parsed = extractJSON(raw);

        if (!parsed) throw new Error("Could not parse search terms JSON");

        return {
            terms: Array.isArray(parsed.terms)
                ? parsed.terms
                      .map(t => String(t).trim())
                      .filter(Boolean)
                      .slice(0, 12)
                : [query],
            topics: Array.isArray(parsed.topics)
                ? parsed.topics
                      .map(t => String(t).trim())
                      .filter(Boolean)
                      .slice(0, 3)
                : [],
            sentiment: typeof parsed.sentiment === "string" ? parsed.sentiment.trim() : "",
        };
    } catch (err) {
        console.error("AI search term generation failed:", err.message);
        const words = query
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 2);
        return { terms: [query, ...words], topics: [], sentiment: "" };
    }
}

module.exports = { analyzePost, fallbackAnalysis, generateSearchTerms };
