# Rightclicked — Technical Notes

## How Rightclicked Works (Simple Overview)

Rightclicked is a Chrome extension that lets you **save LinkedIn posts you're already looking at** into your own personal library. Here's the basic flow:

1. You browse LinkedIn normally in your browser.
2. When you see a post you want to save, you either right-click → "Save to Rightclicked" or click the extension popup.
3. The extension reads the post content **from the page you're already viewing** — it doesn't visit any other pages or crawl LinkedIn.
4. The post data (author, text, engagement numbers, timestamp) is sent to our backend server.
5. The backend stores the post, then runs it through a local AI (LLM) that adds a topic label, tags, a short summary, and a sentiment classification.
6. You can view, search, filter, and organize all your saved posts in the Rightclicked web app.

---

## Handling Ever-Changing DOM Structures on LinkedIn

LinkedIn frequently changes the HTML/CSS class names on their pages (e.g., `.feed-shared-update-v2__description` might become something else overnight). This is one of the biggest challenges for any extension that reads LinkedIn content. Here's how we handle it:

### 1. We prioritize stable attributes over class names

- **`data-urn`** — LinkedIn assigns a unique URN (like `urn:li:activity:123456`) to every post. This is a **data attribute** that LinkedIn's own React code depends on to render the feed. It can't easily be removed without breaking their own app. We use `[data-urn*="urn:li:"]` as our primary selector.
- **`aria-label`** — Accessibility attributes like `aria-label="Like"` and `aria-label="Comment"` are required by law (WCAG / ADA compliance) and by LinkedIn's own accessibility commitments. These are very unlikely to change. We use these to find engagement buttons and social bars.
- **`<time>` elements** — HTML5 time elements with `datetime` attributes are a web standard for timestamps. LinkedIn uses them, and they're stable.

### 2. We use multiple selectors with automatic fallbacks

Instead of relying on one CSS selector, we keep a **list of selectors** ordered from most stable to least stable. If the first one fails, the next one tries, and so on. For example, to find post containers:

1. `[data-urn*="urn:li:"]` (data attribute — very stable)
2. `[data-id*="urn:li:"]` (alternate data attribute)
3. Structural fallback: walk up from `<time>` elements and look for engagement buttons

For author names, we try:

1. Actor/header sections (the area LinkedIn uses for the post author's name and avatar)
2. Links containing `/in/` or `/company/` that are not inside comments
3. Fallback to any profile link

For post text, we try multiple selectors (`[class*="break-words"]`, `[class*="commentary"]`, etc.) and pick the **longest text block** that's not inside a comment section.

### 3. We store raw HTML for future re-parsing

Every saved post includes a raw HTML snippet of the original DOM. If LinkedIn changes their structure and our selectors break, we can **re-parse** old saves with updated logic without needing to re-visit LinkedIn.

### 4. We clean extracted text carefully

LinkedIn's DOM is deeply nested. A single `<span>` might wrap both the post text and a dropdown menu. Our `getCleanText()` function clones the element, strips out dropdown menus, comment sections, and screen-reader-only duplicates, then reads the clean text. This avoids garbage like "Copy linkEmbedNot interestedReport" ending up in your saved post.

### 5. We detect comments vs. post author correctly

LinkedIn nests comments inside the same post container. Without care, you could accidentally grab a commenter's name instead of the post author. We have an `isInsideComment()` check that walks up the DOM tree and skips anything inside a comment section.

---

## Handling Anti-Scraping and Account Bans

**This is the most common worry: "Will I get banned for using this?"**

The short answer: **Rightclicked is designed to be fundamentally different from scraping, and we've built multiple protections to keep you safe.**

### Why Rightclicked is NOT scraping

Scraping means using bots or automated tools to **visit many pages, collect data at scale, and often without the user being present**. LinkedIn detects and bans scrapers because they:

- Use headless browsers (no real browser window)
- Visit hundreds or thousands of pages automatically
- Send rapid, repetitive HTTP requests
- Operate without a logged-in user's knowledge

**Rightclicked does none of these things.** Here's why:

| Scraping Behavior                       | Rightclicked Behavior                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Bot visits pages automatically          | User browses LinkedIn normally; saves happen only when the user clicks a button                          |
| Headless browser / Puppeteer / Selenium | Real Chrome browser with the user present and logged in                                                  |
| Crawls profiles, search results, etc.   | Only reads the one post the user is looking at on their feed                                             |
| Makes HTTP requests to LinkedIn servers | Reads from the DOM that LinkedIn already loaded in the browser — zero extra network requests to LinkedIn |
| Runs 24/7 without human interaction     | Only runs when the user explicitly triggers a save                                                       |

### Built-in protections (what we actually implemented)

#### 1. User-initiated only — no background scanning

The extension has **zero background DOM scanning**. It doesn't use `MutationObserver` on `document.body` (which LinkedIn's Watchdog anti-bot system can detect). It doesn't use `setInterval` to periodically scan the page. Instead, it uses a single `click` event listener. When you click LinkedIn's three-dot menu (⋯) on a post, only then does the extension inject a "Save to Rightclicked" option. If you don't interact, the extension does absolutely nothing.

#### 2. Rate limiting at every layer

- **Content script**: minimum 1.5 seconds between actions, max 30 actions per 60 seconds. If the ceiling is hit, the extension backs off for 30 seconds automatically.
- **Background service worker**: global rate limiter across all tabs — max 60 actions per minute.
- **Backend server**: 10 save requests per minute per user (via `express-rate-limit`). 100 general API requests per 15 minutes. 20 AI analysis calls per hour per IP.
- **Exponential back-off**: if any layer returns a 429 (rate limit) error, the extension automatically backs off with increasing delays.

#### 3. Page-awareness — we only operate where we should

The extension has a `SCRAPING_POLICY` object that explicitly lists allowed and blocked paths:

- **Allowed**: `/feed`, `/in/`, `/posts/`, `/feed/update/` — pages where you normally see posts
- **Blocked**: `/search/`, `/recruiter/`, `/sales/`, `/talent/`, `/jobs/`, `/messaging/` — pages that LinkedIn explicitly blocks in robots.txt or that relate to premium features

If you navigate to a blocked page, the extension does nothing.

#### 4. Anti-fingerprinting — the extension hides itself

LinkedIn can detect extensions by looking for known CSS class names or DOM elements they inject. We counter this:

- Every DOM element we inject uses a **randomized prefix** (e.g., `_r3kf7a`) generated at page load, so there's no fixed class name for LinkedIn to look for.
- We use **inline styles only** — no injected CSS stylesheets or classes.
- The save button is built to look exactly like a native LinkedIn menu item.

#### 5. Tab visibility check

If your LinkedIn tab is in the background (hidden), the extension stops all activity. Background DOM reads while the tab isn't visible are a strong bot signal.

#### 6. No network requests to LinkedIn

The extension **never makes HTTP requests to LinkedIn's servers**. All data is read from the DOM that LinkedIn already rendered in your browser. The only network requests go to our own backend server to save the post. From LinkedIn's perspective, your browsing session looks completely normal.

#### 7. reCAPTCHA on the backend

The backend uses Google reCAPTCHA to verify that save requests come from a real human, not from automated scripts. This protects both the backend from abuse and adds another layer of proof that a real user is behind each action.

### What about LinkedIn's Terms of Service?

LinkedIn's ToS and robots.txt are aimed at **automated data collection at scale** — bots that crawl profiles, scrape search results, or harvest contact information.

Rightclicked is a **personal productivity tool** that helps you organize posts you're already reading. It's the digital equivalent of taking notes on an article you're reading. Key distinctions:

- **Your own session**: The extension only works within your logged-in browsing session.
- **Your own data**: You're saving posts that LinkedIn showed to you in your own feed.
- **No redistribution**: Saved posts are private to your account; they're not republished or shared.
- **User-triggered**: Every save is an intentional action by the user, not automated collection.

### Summary of protections

| Layer             | Protection                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Content script    | Rate limiter (1.5s cooldown, 30/min cap), page visibility check, scraping policy allow/block list |
| DOM interaction   | Zero background scanning, event-delegation only, randomized element prefixes, inline styles       |
| Background worker | Global rate limiter (60/min), exponential back-off on errors                                      |
| Backend server    | Rate limiting (10 saves/min), JWT authentication, reCAPTCHA verification, Helmet security headers |
| Architecture      | No HTTP requests to LinkedIn, reads only from already-loaded DOM, user-initiated actions only     |
