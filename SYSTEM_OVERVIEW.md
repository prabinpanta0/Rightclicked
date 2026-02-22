# Rightclicked system guide

This is the current, plain-language guide to how Rightclicked works.

If you are new to the codebase, read this from top to bottom once. After that, jump to the section you need.

## 1) What is in this project

Rightclicked has three parts:

1. Chrome extension in [extension](extension)
2. Backend API in [backend](backend)
3. Frontend app in [frontend](frontend)

Saved posts are stored in MongoDB using models in [backend/models](backend/models).

## 2) Backend at a glance

Entry point: [backend/server.js](backend/server.js)

Mounted routes:

- [backend/routes/auth.js](backend/routes/auth.js) under `/api/auth`
- [backend/routes/posts.js](backend/routes/posts.js) under `/api/posts`
- [backend/routes/analytics.js](backend/routes/analytics.js) under `/api/analytics`

Auth middleware: [backend/middleware/auth.js](backend/middleware/auth.js)

It verifies JWT and sets `req.userId`.

### Important backend functions

- `checkAiQuota()` in [backend/routes/posts.js](backend/routes/posts.js)
- `analyzePost()` and `generateSearchTerms()` in [backend/services/ollama.js](backend/services/ollama.js)
- `normalizeTag()` and `dedupeTags()` in [backend/routes/posts.js](backend/routes/posts.js)

Tag normalization and dedupe now happen server side on create, manual tag edits, and AI re-analysis.

## 3) Extension flow

The extension does three jobs:

1. Extract post data from LinkedIn DOM
2. Send data to backend with extension token
3. Show clear save feedback

### Background worker

File: [extension/background.js](extension/background.js)

Important methods:

- `savePost(postData)`
- `updateEngagement(postUrl, engagement)`
- `getAccountLabel(token)`
- `notifyTab(tabId, success, message)`
- `tryParseJson(raw)`

Recent behavior:

- Save response parsing is hardened. If backend returns non-JSON text, extension no longer crashes on JSON parse.
- Success message can include destination account label.

### Content script

File: [extension/content.js](extension/content.js)

This is where post detection quality is decided.

Important methods:

- `findPostContainer(el)`
- `findMostVisiblePost()`
- `resolveBestContainer()`
- `extractAuthor(container)`
- `extractPostData(container)`
- `getCleanText(el)`
- `savePostFromUI(container)`

Recent behavior:

- Source-aware extraction for popup, right-click, and injected menu save paths.
- Right-click cache is used for a short window so context-menu saves use the exact clicked post.
- Better author scoring to avoid links like "X likes this" or unrelated names.
- Better line break preservation in text extraction by converting structural nodes to explicit newlines.

### Popup

Files:

- [extension/popup.html](extension/popup.html)
- [extension/popup.js](extension/popup.js)

Important methods:

- `checkAuth()`
- `loadConnectedAccount()`
- `extractCurrentPost()`
- `loadRecentSaves()`

Popup now shows which account is connected, so users know where posts are being saved.

## 4) Frontend flow

API client: [frontend/src/api/index.js](frontend/src/api/index.js)

State stores:

- [frontend/src/store/useAuthStore.js](frontend/src/store/useAuthStore.js)
- [frontend/src/store/usePostStore.js](frontend/src/store/usePostStore.js)

Post rendering:

- [frontend/src/components/PostCard.jsx](frontend/src/components/PostCard.jsx)
- [frontend/src/components/PostExpandModal.jsx](frontend/src/components/PostExpandModal.jsx)

Important formatting helpers:

- `formatPostText(raw)`
- `getParagraphs(text)`
- `extractHashtags(text)`

UI now deduplicates tags and keywords more aggressively, including hyphen and spacing variants.

## 5) End-to-end save path

Typical right-click save:

1. User right-clicks a post on LinkedIn.
2. Background sends `extractPost` to content script with source `context-menu`.
3. Content script resolves the best container and builds `postData`.
4. Background calls `POST /api/posts`.
5. Backend saves post, dedupes tags, and may run AI analysis.
6. Extension shows success or error toast in-page.

Typical popup save is similar, but extraction starts from source `popup`.

## 6) Why account mismatch can happen

Frontend auth token and extension auth token are stored separately.

- Frontend uses browser `localStorage` key `rc-token`
- Extension uses `chrome.storage.local` key `token`

This is intentional, but users can link extension to a different account than the currently open frontend session.

To reduce confusion, popup displays current extension account.

## 7) Quick troubleshooting

If save fails with parse-like errors:

- check backend availability
- check extension token validity
- retry once after refresh

If wrong author is saved:

- verify post path used (`context-menu`, popup, or injected menu)
- inspect `extractAuthor()` candidate scoring in [extension/content.js](extension/content.js)

If text is flattened:

- inspect output of `getCleanText()` in [extension/content.js](extension/content.js)
- confirm stored `postText` in backend response

If duplicate tags appear:

- check normalized output from `dedupeTags()` in [backend/routes/posts.js](backend/routes/posts.js)
- check frontend render dedupe in [frontend/src/components/PostCard.jsx](frontend/src/components/PostCard.jsx)
