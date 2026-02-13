# Rightclicked — Progress Summary for Review

## Codebase Structure

The project is organized into three main directories:

- `extension/`: Chrome extension for saving LinkedIn posts
    - `manifest.json`: Extension manifest (MV3), permissions: activeTab, contextMenus, storage, scripting; host permissions for LinkedIn and localhost backend
    - `background.js`: Service worker handling context menus and save actions
    - `content.js`: Content script injected on LinkedIn pages for post extraction (544 lines, robust selectors with fallbacks)
    - `content.css`: Minimal styles for extension UI
    - `popup.html`: Popup HTML with tabs for save and recent posts
    - `popup.js`: Popup logic for auth, post preview, saving (486 lines, includes reCAPTCHA integration)

- `backend/`: Node.js/Express API server
    - `server.js`: Main server file, uses Express, MongoDB, security middleware (helmet, cors, mongo-sanitize)
    - `config/db.js`: MongoDB connection setup
    - `models/`: Mongoose schemas
        - `Post.js`: Post model with fields for extracted data, LLM outputs (topic, tags, summary, sentiment, keywords), indexes for search/grouping
        - `User.js`: User authentication model
        - `AnalyticsEvent.js`: Analytics tracking
    - `routes/`: API endpoints
        - `auth.js`: Login/register endpoints
        - `posts.js`: CRUD for posts, including save and LLM analysis
        - `analytics.js`: Analytics endpoints
    - `middleware/`: Custom middleware
        - `auth.js`: JWT authentication
        - `rateLimit.js`: Rate limiting
        - `recaptcha.js`: reCAPTCHA verification
    - `services/ollama.js`: LLM service wrapper (431 lines, detailed system prompt for post analysis, returns structured JSON)

- `frontend/`: React SPA
    - `package.json`: Dependencies: React 18, Vite, TailwindCSS v4, Axios, React Router, Zustand
    - `vite.config.js`: Vite config
    - `tailwind.config.js`: Tailwind config
    - `src/`: Source code
        - `App.jsx`: Main app with routing (login, register, dashboard, grouped views, search, analytics, settings)
        - `main.jsx`: React entry point
        - `index.css`: Global styles
        - `api/`: API client
            - `index.js`: Axios setup with auth interceptors
            - `recaptcha.js`: reCAPTCHA client
        - `components/`: Reusable components
            - `Navbar.jsx`: Navigation bar
            - `PostCard.jsx`: Post display with tags editing, reanalyze (209 lines)
            - `GroupFilters.jsx`: Filter UI for grouped views
            - `GroupSelector.jsx`: Group selection component
            - `SearchBar.jsx`: Search input
        - `pages/`: Page components
            - `Dashboard.jsx`: Main dashboard
            - `GroupedView.jsx`: Grouped posts view (by author, topic, etc., 82 lines)
            - `Search.jsx`: Search page
            - `Analytics.jsx`: Analytics dashboard
            - `Login.jsx`, `Register.jsx`: Auth pages
            - `Settings.jsx`: User settings
        - `store/`: Zustand stores
            - `useAuthStore.js`: Auth state
            - `usePostStore.js`: Posts state and API calls

## Quick status

- What exists (implemented so far):
    - Chrome extension scaffold: `extension/` with `content.js` (robust extraction using multiple selectors like `[data-urn*="urn:li:activity"]`, fallback strategies for author, text, engagement), `background.js`, `popup.*`, and `manifest.json` — captures user action on LinkedIn pages. Extraction includes author name/URL, post text, engagement metrics (likes/comments/reposts), timestamp, post URL, raw HTML snippet.
    - Backend service: `backend/server.js` (Express app with security, CORS for extension), routes in `backend/routes/` including `posts.js` (POST /api/posts for saving, GET for fetching grouped/search), `auth.js` (JWT-based auth), `analytics.js` — receives saves and persists posts. Uses MongoDB with Mongoose models.
    - Data models: `backend/models/Post.js` (schema with extracted fields + LLM outputs: topic, tags[], summary, sentiment, keywords[], aiAnalyzed flag), `User.js` (email/password), `AnalyticsEvent.js`.
    - LLM integration hook: `backend/services/ollama.js` (service to call local/remote LLM for classification/tagging/summaries). Uses Ollama API with qwen2.5:0.5b model, structured JSON output via detailed system prompt. Analyzes post text and returns topic (from fixed list), tags (3-6 specific), summary (1 sentence), sentiment (8 categories), keywords (3-5 terms).
    - Frontend app: `frontend/` with React/Vite/TailwindCSS, pages and components to view/search posts (`PostCard.jsx` with tag editing and reanalyze button, `Dashboard.jsx`, `GroupedView.jsx` with filters, etc.). Zustand stores for state management. API client with auth.
    - Filters: value-specific filters in grouped views. Added `GroupFilters.jsx` (displays filter buttons for group values like author names, topics, tags with #, sentiments) and updated `GroupedView.jsx` to show actual filter values and smooth-scroll to groups. Files changed: `frontend/src/components/GroupFilters.jsx`, `frontend/src/pages/GroupedView.jsx`.
    - Authentication: JWT-based login/register in backend, stored in extension popup and frontend.
    - Search: Basic text search on postText and authorName via MongoDB text index.
    - Analytics: Basic tracking in `AnalyticsEvent.js` model, endpoints in `analytics.js`.

## What's remaining (high-level)

- Finalize extension UX: show "Saved" confirmation and handle failures (currently popup shows save result but no persistent feedback).
- Robust extraction: resilient selectors, image/media capture, and fallback heuristics (content.js has good fallbacks but could add image URLs).
- Search & grouping: index posts for fast search (currently basic text index), implement topic and tag grouping views and filters (grouped view exists but may need more groupBy options like date, engagement).
- LLM integration improvements: prompt tuning (current prompt is good but may need examples), caching (no caching yet), batching (calls one by one), offline fallback (no fallback if LLM down).
- Monitoring & QA: logging (basic console.error), metrics (save success rate, time-to-save), manual review UI for bad classifications (no UI yet).
- Tests, CI, and deployment automation (no tests, no CI).
- Additional features: Edit topic/tags in UI (PostCard has tag editing but not topic), bulk actions, export, etc.

## What's remaining (high-level)

- Finalize extension UX: show "Saved" confirmation and handle failures.
- Robust extraction: resilient selectors, image/media capture, and fallback heuristics.
- Search & grouping: index posts for fast search, implement topic and tag grouping views and filters.
- LLM integration improvements: prompt tuning, caching, batching, and offline fallback.
- Monitoring & QA: logging, metrics (save success rate, time-to-save), and manual review UI for bad classifications.
- Tests, CI, and deployment automation.

## Key Technologies and Dependencies

- **Extension**: Vanilla JS, Chrome Extension API (MV3)
- **Backend**: Node.js, Express.js, MongoDB with Mongoose, JWT for auth, Helmet for security, CORS, express-mongo-sanitize
- **LLM**: Ollama (local LLM server), default model qwen2.5:0.5b, can be configured via env vars
- **Frontend**: React 18, Vite, TailwindCSS v4, Axios for API, React Router for routing, Zustand for state management
- **Other**: reCAPTCHA for spam prevention, dotenv for config

## Role of the LLM in this project (current + planned)

Primary LLM responsibilities:

- Topic detection: infer one or more topic labels from post text + metadata. Uses fixed taxonomy: Technology, Business, Career, Leadership, Marketing, Finance, Entrepreneurship, Education, Health, AI & Machine Learning, Personal Development, Industry News, Sustainability, Design, Engineering, Science, Other
- Tag suggestion / keyword extraction: return normalized tags (short keywords) and suggested tags for user review. 3-6 specific lowercase tags like "remote-work", "fundraising"
- Summarization / excerpting: produce a short summary or snippet for display in the library. One sentence TL;DR, max 30 words
- Sentiment classification: classify tone/purpose into 8 categories: educational, inspirational, controversial, promotional, hiring, opinion, news, personal_story
- Keyword extraction: 3-5 important lowercase terms from the post text
- Deduplication / similarity: create embeddings or similarity scores to detect duplicate or highly similar saves (planned, not implemented).
- Content safety / classification (optional): flag NSFW or policy-sensitive posts for review (planned).

Where it runs:

- Calls originate in `backend/services/ollama.js` after the backend receives extracted post data from the extension. The service wraps requests to the configured LLM endpoint (Ollama or other, default http://localhost:11434). Uses fetch with timeout (30s), temperature 0.3, structured JSON response enforced by system prompt.

Design notes and recommendations:

- Use concise, deterministic prompts for classification (few-shot where needed) and return structured JSON (labels, confidences, tags, summary). Current prompt includes example input/output.
- Cache classification results and reuse embeddings for search and grouping (not implemented yet).
- Prefer a hybrid flow: auto-classify then allow user edits (essential for accuracy and trust). PostCard has "Reanalyze" button to re-run LLM.

Design notes and recommendations:

- Use concise, deterministic prompts for classification (few-shot where needed) and return structured JSON (labels, confidences, tags, summary).
- Cache classification results and reuse embeddings for search and grouping.
- Prefer a hybrid flow: auto-classify then allow user edits (essential for accuracy and trust).

## How "topic" is determined (recommended approach)

1. Primary method (current plan): LLM-based classification using the post's text, author name, and short context. Prompt asks for 1-3 topic labels from a bounded taxonomy or free-form if unknown.
2. Discoverability / refinement: periodically run clustering over embeddings of saved posts (UMAP + HDBSCAN or k-means) to surface emergent topics, then map clusters to user-friendly topic labels.
3. Hybrid UX: present the LLM-suggested topic(s) in the UI and let users confirm or change them. Over time, use confirmed edits as training data to improve prompts and label normalization.

Prompt example (structure expected from LLM):

- Input: post_text, author_name, post_url
- Output (JSON): {"topics":[{"label":"Leadership","confidence":0.92}],"tags":["management","team-building"],"summary":"Two-sentence summary..."}

Fallbacks:

- If LLM confidence is low, mark topic as "unknown" and surface to the user for tagging.

## How tags are decided

- Automatic suggestion: extract candidate tags via the LLM using keyword extraction + NER; returns 3-6 specific lowercase tags useful for grouping (e.g. "remote-work", "fundraising", "open-source"). Prompt specifies tags should be specific and useful.
- User-editable: users can add/remove tags on a saved post via `PostCard.jsx` (add tag input, remove buttons); user tags are authoritative and stored alongside auto-tags in `tags` array.
- Ranking & display: show all tags first; allow quick add/remove in the UI. Tags displayed with # prefix in filters.
- Keywords vs Tags: LLM also returns `keywords` (3-5 important terms from text) stored separately, but UI focuses on `tags` for grouping.

Tag generation rules to implement:

- Limit to 5-10 short tags per post (current prompt says 3-6).
- Prefer nouns and compound nouns ("design systems", "careers") over long phrases.
- Map synonyms (via a small synonyms map) to canonical tags where possible (not implemented yet).

## How extraction currently works (extension → backend → DB)

1. User triggers save action in the Chrome extension (clicking the extension popup or context action on a LinkedIn post).
2. `content.js` extracts fields from the LinkedIn DOM using robust selectors with multiple fallbacks:
    - **Post container detection**: Uses selectors like `[data-urn*="urn:li:activity"]`, `[data-urn*="urn:li:ugcPost"]`, `.feed-shared-update-v2`, with `getAllPostContainers()` to find all posts and `findPostContainer()` to locate the one under cursor.
    - **Author extraction**: `extractAuthor()` with strategies: actor/header sections first (selectors like `[class*="feed-shared-actor"]`), then links not in comments, fallback to any link. Avoids commenter names by checking `isInsideComment()`.
    - **Post text**: Scans candidates like `[class*="break-words"]`, `[class*="commentary"]`, `[class*="feed-shared-text"]`, takes longest text >60 chars.
    - **Engagement**: `extractEngagement()` parses text/aria-labels for patterns like "379 reactions", "22 comments", "4 reposts" using regex.
    - **Timestamp**: `<time>` element or sub-description.
    - **Post URL**: From `data-urn` attribute, constructs LinkedIn URL.
    - **Raw HTML**: Includes raw snippet for reprocessing.
3. Extension sends a POST to backend route `/api/posts` with payload (extracted data + user auth token from popup storage).
4. Backend validates (auth middleware, rate limit, reCAPTCHA if enabled), persists raw post data into `Post` model, then enqueues or directly calls LLM service for classification/tagging/summarization.
5. Backend stores the returned topic/tags/summary/sentiment/keywords and sets `aiAnalyzed: true` into the DB for search/grouping.
6. Frontend fetches posts via GET `/api/posts` with query params for grouping/search.

Extraction robustness practices:

- Use multiple DOM selectors with fallbacks; prefer semantic attributes or accessible text where possible.
- Store the raw HTML snippet for later re-parsing if LinkedIn changes structure.
- Sanitize and trim text to a max length for LLM input; keep full raw text stored if license/privacy allows.

## Risks and mitigations

- LinkedIn DOM changes
    - Mitigation: store raw snippet, use multiple selectors and heuristics, and implement a fast fix path in the extension for selector updates.
- LinkedIn anti-scraping / rate limiting
    - Mitigation: all saves are user-initiated (clicks), throttle saves on extension and backend per-user, exponential backoff for retries, and respect robots/legal constraints.
- LLM topic quality
    - Mitigation: hybrid auto + human-in-the-loop UX, confidence thresholds, logging of low-confidence cases, periodic manual review and prompt tuning.
- Privacy & legal
    - Mitigation: store minimal required fields, display and ask for consent, provide privacy policy, allow user deletion of saves.
- Cost/performance of LLM calls
    - Mitigation: cache results, batch requests where possible, use smaller local models for classification if they meet quality requirements, and fall back to rules for simple keyword tags.

## Data flow (concise)

1. Extension extracts (content.js) → 2. POST to backend `/api/posts` (posts.js route) → 3. Save raw data in DB (Post model) → 4. Call LLM (ollama.js service) → 5. Save LLM outputs (topic, tags, summary, sentiment, keywords) → 6. Index for search/grouping (MongoDB indexes) and surface in frontend (GroupedView, Search).

## Backend API Endpoints

- **Auth** (`/api/auth`):
    - POST /register: Create user account
    - POST /login: Authenticate user, return JWT
- **Posts** (`/api/posts`):
    - POST /: Save new post (validates, checks duplicates, runs LLM analysis, stores)
    - GET /: Fetch posts with optional query params: `groupBy` (author, topic, tags, sentiment), `search` (text search), `limit`, `skip`
    - PUT /:id: Update post tags
    - DELETE /:id: Delete post
    - POST /:id/analyze: Re-run LLM analysis on existing post
- **Analytics** (`/api/analytics`):
    - POST /event: Log analytics event
    - GET /stats: Get user stats (total posts, etc.)

All endpoints except auth require JWT auth. Posts save has rate limiting (saveLimiter middleware).

## Frontend Features

- **Authentication**: Login/Register pages, JWT stored in localStorage, auto-logout on invalid token.
- **Dashboard**: Lists recent posts with PostCard components.
- **Grouped View**: `/groups/:groupBy` (e.g., /groups/author, /groups/topic) shows posts grouped by the field, with GroupFilters for filtering specific values. Smooth scroll to groups.
- **Search**: `/search` page with SearchBar, searches postText and authorName.
- **PostCard**: Displays author, text (expandable), sentiment badge, tags (editable), engagement, date. Buttons for edit tags, reanalyze, delete.
- **Analytics**: Basic dashboard showing post counts, etc.
- **Settings**: User settings (placeholder).
- **State Management**: Zustand stores for auth (token, user) and posts (fetch, group, search actions).

## Frontend Features

- **Authentication**: Login/Register pages, JWT stored in localStorage, auto-logout on invalid token.
- **Dashboard**: Lists recent posts with PostCard components.
- **Grouped View**: `/groups/:groupBy` (e.g., /groups/author, /groups/topic) shows posts grouped by the field, with GroupFilters for filtering specific values. Smooth scroll to groups.
- **Search**: `/search` page with SearchBar, searches postText and authorName.
- **PostCard**: Displays author, text (expandable), sentiment badge, tags (editable), engagement, date. Buttons for edit tags, reanalyze, delete.
- **Analytics**: Basic dashboard showing post counts, etc.
- **Settings**: User settings (placeholder).
- **State Management**: Zustand stores for auth (token, user) and posts (fetch, group, search actions).

## Prepared talking points / likely questions

- Q: "How are topics produced?"
    - A: "We use an LLM in the backend to classify the saved post text into 1–3 topic labels (auto) and surface them for user confirmation; we also run clustering on embeddings to find emergent topics and refine labels."

- Q: "What if the LLM is wrong?"
    - A: "Users can edit topic/tags; we log low-confidence results for manual review and use those corrections to tune prompts and normalization rules."

- Q: "Are we storing full LinkedIn content?"
    - A: "We store the post text and minimal metadata; by default we store a raw HTML snippet only for reprocessing and troubleshooting. We will document privacy and deletion options."

- Q: "How do we handle LinkedIn changes or anti-scraping?"
    - A: "We only act on user-triggered saves, throttle calls, keep fallbacks in the extension, and retain raw snippets so re-parsing can be implemented without re-scraping."

- Q: "How mature is LLM integration?"
    - A: "We have a service wrapper in `backend/services/ollama.js`. Next steps: prompt engineering, structured JSON responses, caching, and adding embeddings for search."

## Next suggested immediate steps (for the evening deliverable)

- Add "Saved" UX in extension (confirmation + retry on failure). Currently popup shows save result but no persistent feedback in content script.
- Improve grouped views: Add more groupBy options (e.g., date saved, engagement level), allow editing topic in PostCard (currently only tags).
- Add caching for LLM calls to avoid re-analysis on duplicates.
- Create a short demo script (3–5 saved posts) showing the end-to-end flow.
- Add tests for key functions (extraction, LLM parsing).
