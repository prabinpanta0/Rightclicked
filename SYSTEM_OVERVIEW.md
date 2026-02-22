# Rightclicked System Overview

This document explains how the full Rightclicked system works today, from the browser extension all the way to the database. It is written as a practical walkthrough so someone new to the project can understand the moving pieces and trace a save action end to end.

## High level architecture

Rightclicked is split into three main parts:

1. Browser extension in [extension/background.js](extension/background.js), [extension/content.js](extension/content.js), and [extension/popup.js](extension/popup.js)
2. Backend API in [backend/server.js](backend/server.js) and route files under [backend/routes](backend/routes)
3. Frontend web app in [frontend/src](frontend/src)

All post data is stored in MongoDB through Mongoose models in [backend/models](backend/models).

## Backend request lifecycle

The backend starts in [backend/server.js](backend/server.js). It calls `connectDB()` from [backend/config/db.js](backend/config/db.js), mounts middleware, and registers these route groups:

- `/api/auth` from [backend/routes/auth.js](backend/routes/auth.js)
- `/api/posts` from [backend/routes/posts.js](backend/routes/posts.js)
- `/api/analytics` from [backend/routes/analytics.js](backend/routes/analytics.js)

Authentication is handled by `auth()` in [backend/middleware/auth.js](backend/middleware/auth.js). It reads the bearer token, verifies it with JWT, and puts `req.userId` on the request.

### Auth routes

Important functions and handlers in [backend/routes/auth.js](backend/routes/auth.js):

- `router.post("/register")`: creates a new user and returns token plus user
- `router.post("/login")`: validates credentials and returns token plus user
- `router.get("/settings")`: returns profile and AI settings for current user
- `router.patch("/settings")`: updates AI settings

The user model is in [backend/models/User.js](backend/models/User.js). Password hashing runs in `userSchema.pre("save")`, and password comparison is in `comparePassword()`.

### Post routes

Core post logic lives in [backend/routes/posts.js](backend/routes/posts.js):

- `router.post("/")`: saves a post for `req.userId`, deduplicates by `postUrl` or text prefix, optionally runs AI analysis
- `router.get("/")`: paginated post list for current user
- `router.get("/search")`: keyword search using `$text` or regex fallback
- `router.get("/search/ai")`: AI-expanded search
- `router.get("/group/:by")`: grouped views by author, topic, date, tags, sentiment, or engagement

AI usage limits are handled by `checkAiQuota()` and analysis/search helpers from [backend/services/ollama.js](backend/services/ollama.js), including `analyzePost()` and `generateSearchTerms()`.

### Analytics routes

In [backend/routes/analytics.js](backend/routes/analytics.js):

- `router.post("/event")`: tracks allowed events such as `save_attempt`, `save_success`, `search`, and `session_start`
- `router.get("/dashboard")`: computes dashboard stats including save success rate, average save time, and top authors

## Extension flow

The extension has three responsibilities: capture LinkedIn post data, authenticate against Rightclicked backend, and send save/update requests.

### Background service worker

Main logic is in [extension/background.js](extension/background.js).

Important functions:

- `GlobalRateLimit.canAct()` and `GlobalRateLimit.record()`: throttles extension actions
- `savePost(postData)`: sends `POST /api/posts` with stored token
- `updateEngagement(postUrl, engagement)`: sends engagement patch request
- `getAuthStatus()`: checks whether token exists in extension storage
- `notifyTab(tabId, success, message)`: shows in-page notification via content script
- `getAccountLabel(token)`: fetches and caches `/api/auth/settings` so save confirmations can show the destination account

Key listeners:

- `chrome.contextMenus.onClicked`: asks content script for post extraction and then calls `savePost()`
- `chrome.runtime.onMessage`: handles popup and content script actions like `savePost`, `getStatus`, and `logout`
- `chrome.tabs.onUpdated`: captures token from frontend callback URL `/extension-connected?token=...`

### Content script on LinkedIn

Main logic is in [extension/content.js](extension/content.js).

Important extraction and selection functions:

- `getAllPostContainers()`
- `findPostContainer(el)`
- `findMostVisiblePost()`
- `extractAuthor(container)`
- `extractPostData(container)`
- `extractEngagement(container)`
- `getCleanText(el)`

Important UX and save functions:

- `showToast(success, text)`
- `savePostFromUI(container)`
- `_waitForDropdown(trigger, attempt)`
- `_injectSaveOption(content, trigger, dropdown)`

Important behavior details:

- `chrome.runtime.onMessage` handles `extractPost` and `showNotification`
- `extractPost` is now source-aware
    - source `context-menu` prefers the last right-click target
    - source `popup` uses the most visible post
- `getCleanText()` preserves line breaks better by using `innerText` after cleaning dropdown and comment nodes

### Popup

Popup UI is in [extension/popup.html](extension/popup.html) and behavior in [extension/popup.js](extension/popup.js).

Important functions in [extension/popup.js](extension/popup.js):

- `checkAuth()`
- `loadConnectedAccount()`
- `extractCurrentPost()`
- `loadRecentSaves()`
- `popupTrackEvent(event, meta)`

Popup now displays the connected backend account and includes that account in save confirmation text when available.

## Frontend web app flow

The React app is under [frontend/src](frontend/src).

### API client

API wrappers are in [frontend/src/api/index.js](frontend/src/api/index.js). Axios interceptor attaches token from `localStorage` (`rc-token`) to each request.

Common API functions:

- `login()`, `register()`
- `getPosts()`, `searchPosts()`, `aiSearchPosts()`
- `getGroupedPosts()`
- `updatePostTags()`, `deletePost()`, `analyzePost()`, `batchAnalyze()`
- `trackEvent()`, `getAnalyticsDashboard()`
- `getSettings()`, `updateSettings()`

### Auth state

Auth state is managed by `useAuthStore` in [frontend/src/store/useAuthStore.js](frontend/src/store/useAuthStore.js).

Important methods:

- `login(email, password)`
- `register(email, password, name)`
- `logout()`
- `startHeartbeat()` and `stopHeartbeat()` for session analytics

### Post state

Post state is managed by `usePostStore` in [frontend/src/store/usePostStore.js](frontend/src/store/usePostStore.js).

Important methods:

- `fetchPosts(page)`
- `silentRefresh()`
- `searchPosts(params)`
- `aiSearch(query)`
- `fetchGrouped(groupBy)`
- `removePost(id)`
- `updateTags(id, tags)`
- `reanalyze(id)`
- `batchAnalyze()`

### Post rendering

Post cards render in [frontend/src/components/PostCard.jsx](frontend/src/components/PostCard.jsx), and full view modal is in [frontend/src/components/PostExpandModal.jsx](frontend/src/components/PostExpandModal.jsx).

Key text formatting functions in both components:

- `formatPostText(raw)`
- `extractHashtags(text)`
- `getParagraphs(text)`

`getParagraphs()` is used to render multiple paragraph blocks instead of collapsing everything into one long paragraph.

## End to end save sequence

This is the typical save path for a right-click save:

1. User right-clicks a LinkedIn post
2. `chrome.contextMenus.onClicked` in [extension/background.js](extension/background.js) sends `extractPost` with source `context-menu`
3. [extension/content.js](extension/content.js) finds the best post container and returns `postData`
4. `savePost(postData)` in [extension/background.js](extension/background.js) calls `POST /api/posts`
5. `router.post("/")` in [backend/routes/posts.js](backend/routes/posts.js) validates, deduplicates, saves, and may run AI analysis
6. Background returns success with optional `accountLabel`
7. Content script shows toast via `showToast()` with author and destination account when available

## Account linking behavior

The extension keeps its own token in `chrome.storage.local`.

- Frontend login token is stored in browser `localStorage` (`rc-token`)
- Extension token is stored separately and is set through `/connect-extension` then `/extension-connected?token=...`

This separation is intentional, but it means users can accidentally link extension and frontend to different accounts. The popup now exposes `Connected account: ...` to make the active extension account explicit.

## Practical debugging tips

- If saving fails only in extension, check token in extension storage and verify `loadConnectedAccount()` result in popup
- If wrong post is saved, trace container selection through `extractPost` source handling and `findPostContainer()`
- If text looks flattened, inspect `post.postText` and check extraction output from `getCleanText()` before backend save
- If analytics looks empty, confirm `trackEvent()` calls include valid event names from the backend allowlist
