const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:0.5b";

// Advanced system prompt -- single call returns structured JSON with:
//   topic, tags, summary, sentiment, keywords

const SYSTEM_PROMPT = `You are a LinkedIn post analysis engine for the "Rightclicked" app.
Your job is to analyze a saved LinkedIn post and return structured metadata that helps users organize, search, and rediscover posts later.

You MUST respond with ONLY valid JSON. No markdown, no explanation, no extra text.

The JSON schema you must follow:
{
  "topic": "<exactly ONE broad category>",
  "tags": ["<3 to 6 specific lowercase tags>"],
  "summary": "<one sentence TL;DR, max 30 words>",
  "sentiment": "<exactly ONE of: educational, inspirational, controversial, promotional, hiring, opinion, news, personal_story>",
  "keywords": ["<3 to 5 important lowercase terms from the post>"]
}

Rules:
- "topic" must be exactly ONE of: Technology, Business, Career, Leadership, Marketing, Finance, Entrepreneurship, Education, Health, AI & Machine Learning, Personal Development, Industry News, Sustainability, Design, Engineering, Science, Other
- "tags" should be specific, lowercase, and useful for grouping similar posts (e.g. "remote-work", "fundraising", "open-source", "hiring", "layoffs", "product-launch")
- "summary" is a single sentence capturing the core point of the post, written in third person (e.g. "The author argues that..." or "A breakdown of...")
- "sentiment" classifies the tone/purpose of the post
- "keywords" are the most important nouns/terms from the text itself (not categories)

Example input: "Just raised our Series A! $12M to build the future of developer tools. Grateful to our investors and the amazing team that made this possible."
Example output: {"topic":"Entrepreneurship","tags":["fundraising","series-a","developer-tools","startup"],"summary":"The author announces a $12M Series A raise for a developer tools startup.","sentiment":"promotional","keywords":["series a","developer tools","investors","fundraising"]}`;

async function analyzePost(postText) {
    try {
        const trimmed = postText.slice(0, 1500);
        const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                system: SYSTEM_PROMPT,
                prompt: `Analyze this LinkedIn post:\n\n"${trimmed}"`,
                stream: false,
                options: {
                    temperature: 0.3,
                    num_predict: 300,
                },
            }),
            signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
        const data = await res.json();
        const raw = (data.response || "").trim();

        // Try to parse JSON from the response (may have markdown fences)
        const jsonStr = raw
            .replace(/^```json?\s*/i, "")
            .replace(/```\s*$/, "")
            .trim();
        const parsed = JSON.parse(jsonStr);

        return {
            topic: typeof parsed.topic === "string" ? parsed.topic : "Other",
            tags: Array.isArray(parsed.tags)
                ? parsed.tags
                      .map(t => String(t).toLowerCase().trim())
                      .filter(Boolean)
                      .slice(0, 8)
                : [],
            summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 200) : "",
            sentiment: typeof parsed.sentiment === "string" ? parsed.sentiment.toLowerCase().trim() : "",
            keywords: Array.isArray(parsed.keywords)
                ? parsed.keywords
                      .map(k => String(k).toLowerCase().trim())
                      .filter(Boolean)
                      .slice(0, 6)
                : [],
        };
    } catch (err) {
        console.error("AI analysis failed:", err.message);
        // Return fallback so we still get partial data
        return fallbackAnalysis(postText);
    }
}

// Fallback: keyword + topic detection without LLM (used when Ollama is down)

function fallbackAnalysis(postText) {
    const text = postText.toLowerCase();
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

    // Rule-based topic detection
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
    if (!topic && bestScore === 0) topic = "Other";

    // Rule-based sentiment detection
    let sentiment = "";
    if (/\b(learn|lesson|tip|how to|guide|explained)\b/i.test(text)) sentiment = "educational";
    else if (/\b(inspir|motivat|grateful|proud|achievement)\b/i.test(text)) sentiment = "inspirational";
    else if (/\b(hiring|we.?re hiring|open role|apply now|position)\b/i.test(text)) sentiment = "hiring";
    else if (/\b(launch|announc|excited to share|check out our)\b/i.test(text)) sentiment = "promotional";
    else if (/\b(opinion|unpopular|hot take|disagree|debate)\b/i.test(text)) sentiment = "opinion";
    else if (/\b(breaking|report|according to|study shows)\b/i.test(text)) sentiment = "news";

    return {
        topic,
        tags: keywords.slice(0, 3),
        summary: "",
        sentiment,
        keywords,
    };
}

const SEARCH_PROMPT = `You are a search query expander for the "Rightclicked" app, which saves LinkedIn posts.
The user wants to find saved posts by describing a topic in natural language.
Your job is to generate an array of search terms that would match relevant posts.

You MUST respond with ONLY valid JSON. No markdown, no explanation, no extra text.

The JSON schema:
{
  "terms": ["<5 to 10 specific search terms or phrases>"],
  "topics": ["<1 to 3 matching topic categories>"],
  "sentiment": "<optional: one of educational, inspirational, controversial, promotional, hiring, opinion, news, personal_story, or empty string>"
}

Rules:
- "terms" should include synonyms, related words, abbreviations, and specific phrases someone might use in a LinkedIn post about this topic
- "topics" must be from: Technology, Business, Career, Leadership, Marketing, Finance, Entrepreneurship, Education, Health, AI & Machine Learning, Personal Development, Industry News, Sustainability, Design, Engineering, Science, Other
- "sentiment" should be set only if the query clearly implies a specific tone, otherwise use ""
- Think about what words would actually appear in LinkedIn posts about this topic

Example input: "startup fundraising tips"
Example output: {"terms":["fundraising","startup","series a","seed round","investors","venture capital","vc","pitch deck","raise","funding"],"topics":["Entrepreneurship","Finance"],"sentiment":"educational"}`;

async function generateSearchTerms(query) {
    try {
        const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                system: SEARCH_PROMPT,
                prompt: `Generate search terms for this query: "${query}"`,
                stream: false,
                options: { temperature: 0.3, num_predict: 200 },
            }),
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
        const data = await res.json();
        const raw = (data.response || "").trim();
        const jsonStr = raw
            .replace(/^```json?\s*/i, "")
            .replace(/```\s*$/, "")
            .trim();
        const parsed = JSON.parse(jsonStr);

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
        // Fallback: split query into individual words as search terms
        const words = query
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 2);
        return { terms: [query, ...words], topics: [], sentiment: "" };
    }
}

module.exports = { analyzePost, fallbackAnalysis, generateSearchTerms };
