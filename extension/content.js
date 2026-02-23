// Rightclicked -- LinkedIn post saver content script
// Respects LinkedIn's Terms of Service and robots.txt
// This extension augments the user's OWN browsing experience (no automated crawling)

// ── Rate-limiter ──────────────────────────────────────────────
// Prevents excessive DOM reads and API calls to stay well within
// LinkedIn's acceptable-use envelope. All extraction + injection
// goes through this gate.

const RateLimiter = {
    _lastAction: 0,
    _actionCount: 0,
    _windowStart: Date.now(),
    _COOLDOWN_MS: 1500, // min gap between consecutive actions
    _MAX_PER_WINDOW: 30, // max actions per rolling window
    _WINDOW_MS: 60_000, // rolling window = 60 s
    _backoffUntil: 0, // timestamp -- skip everything until this

    canAct() {
        const now = Date.now();
        if (now < this._backoffUntil) return false;

        // Reset rolling window if it expired
        if (now - this._windowStart > this._WINDOW_MS) {
            this._windowStart = now;
            this._actionCount = 0;
        }

        if (this._actionCount >= this._MAX_PER_WINDOW) {
            console.warn("Rightclicked: rate-limit ceiling hit, backing off 30 s");
            this._backoffUntil = now + 30_000;
            return false;
        }

        if (now - this._lastAction < this._COOLDOWN_MS) return false;

        return true;
    },

    record() {
        this._lastAction = Date.now();
        this._actionCount++;
    },

    /** Exponential back-off (call when LinkedIn returns 429 etc.) */
    backoff(seconds = 30) {
        this._backoffUntil = Date.now() + seconds * 1000;
        console.warn(`Rightclicked: backing off for ${seconds}s`);
    },
};

// ── Robots.txt / scraping-policy compliance ──────────────────
// We only read posts the *user* is already viewing in their feed.
// No programmatic page fetches, no profile crawling, no search-
// result scraping. This mirrors "browser extension augmenting
// the user's own session" which is distinct from scraping.
const SCRAPING_POLICY = {
    // Pages we are allowed to operate on (user is browsing them)
    ALLOWED_PATHS: ["/feed", "/in/", "/posts/", "/feed/update/"],
    // Pages we must NOT touch (as per robots.txt)
    BLOCKED_PATHS: ["/search/", "/recruiter/", "/sales/", "/talent/", "/jobs/", "/messaging/"],

    isAllowed() {
        const path = window.location.pathname;
        if (this.BLOCKED_PATHS.some(b => path.startsWith(b))) return false;
        if (this.ALLOWED_PATHS.some(a => path.includes(a))) return true;
        // Default: allow if on linkedin.com main feed
        return path === "/" || path === "";
    },
};

// ── Anti-fingerprinting ──────────────────────────────────────
// Generate a random prefix for any DOM elements we inject.
// This prevents LinkedIn from detecting the extension by scanning
// for known CSS class names or data-attributes.
const _pfx = "_r" + crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 5);

// ── Page Visibility ──────────────────────────────────────────
// Background activity while the tab isn't visible is a strong bot signal.
function isTabVisible() {
    return !document.hidden;
}

// ── Extension context validity check ─────────────────────────
function isContextValid() {
    try {
        return !!chrome.runtime?.id;
    } catch {
        return false;
    }
}

// 1) Post container detection  (resilient, multi-selector)

// We keep MULTIPLE selector strategies so that when LinkedIn
// changes one class name the others still work.
const POST_SELECTORS = [
    // data-urn is stable — LinkedIn's own React rendering depends on it.
    '[data-urn*="urn:li:"]',
    // LinkedIn sometimes uses data-id with URN values
    '[data-id*="urn:li:"]',
];

function getAllPostContainers() {
    const seen = new Set();
    const out = [];
    for (const sel of POST_SELECTORS) {
        try {
            document.querySelectorAll(sel).forEach(el => {
                if (!seen.has(el)) {
                    seen.add(el);
                    out.push(el);
                }
            });
        } catch (_) {}
    }
    // Structural fallback: walk up from <time> elements to find post wrappers.
    // Uses aria-label on engagement buttons — required for accessibility, can't be removed.
    if (out.length === 0) {
        for (const timeEl of document.querySelectorAll("time")) {
            let cur = timeEl.parentElement;
            for (let i = 0; i < 15 && cur && cur !== document.body; i++) {
                if (cur.querySelector('button[aria-label*="Like" i], button[aria-label*="Comment" i]')) {
                    if (!seen.has(cur)) {
                        seen.add(cur);
                        out.push(cur);
                    }
                    break;
                }
                cur = cur.parentElement;
            }
        }
    }
    return out;
}

function findPostContainer(el) {
    if (!el) return null;
    let cur = el;
    while (cur && cur !== document.body) {
        // data-urn / data-id with LinkedIn URN — primary signal
        const urn = cur.getAttribute?.("data-urn") || cur.getAttribute?.("data-id") || "";
        if (urn.includes("urn:li:")) return cur;
        const cls = typeof cur.className === "string" ? cur.className : "";
        if (cls.includes("feed-shared-update") || cls.includes("occludable-update")) return cur;
        cur = cur.parentElement;
    }
    for (const c of getAllPostContainers()) {
        if (c.contains(el)) return c;
    }
    return null;
}

// When no specific click target exists (popup flow), find the post
// closest to the center of the viewport.
function findMostVisiblePost() {
    const containers = getAllPostContainers();
    if (containers.length === 0) return null;

    const vh = window.innerHeight;
    const center = vh / 2;
    let best = null;
    let bestDist = Infinity;

    for (const c of containers) {
        const r = c.getBoundingClientRect();
        // Must be at least partially in view and not tiny
        if (r.bottom < 0 || r.top > vh || r.height < 50) continue;
        const mid = (r.top + r.bottom) / 2;
        const d = Math.abs(mid - center);
        if (d < bestDist) {
            bestDist = d;
            best = c;
        }
    }

    return best;
}

function isElementMostlyVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 220 || r.height < 80) return false;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return false;
    return true;
}

// 2) Data extraction

// LinkedIn nests comments inside the same post container.
// The actual post author lives in the actor/header section, NOT in comments.
// We must search the actor area first to avoid picking up a commenter name.

const ACTOR_SELECTORS = [
    '[class*="feed-shared-actor"]',
    '[class*="update-components-actor"]',
    '[class*="feed-shared-header"]',
    '[class*="update-components-header"]',
];

const COMMENT_SELECTORS = [
    '[class*="comments-comment"]',
    '[class*="comment-item"]',
    '[class*="comments-replies"]',
    '[class*="social-details-social-activity"]',
];

function isInsideComment(el, container) {
    let cur = el;
    while (cur && cur !== container) {
        const cls = typeof cur.className === "string" ? cur.className : "";
        if (
            cls.includes("comments-comment") ||
            cls.includes("comment-item") ||
            cls.includes("comments-replies") ||
            cls.includes("social-details-social-activity")
        ) {
            return true;
        }
        cur = cur.parentElement;
    }
    return false;
}

// Detect if an element is inside a dropdown / control menu overlay.
// When the user clicks "Save to Rightclicked", the dropdown is still
// open in the DOM. We must skip its contents during extraction.
function isInsideDropdown(el, container) {
    let cur = el;
    while (cur && cur !== container) {
        const cls = typeof cur.className === "string" ? cur.className : "";
        if (
            cls.includes("artdeco-dropdown__content") ||
            cls.includes("control-menu__content") ||
            cls.includes("artdeco-dropdown__item") ||
            cls.includes("feed-shared-control-menu")
        ) {
            return true;
        }
        // Also skip our own injected elements
        if (cur.hasAttribute && cur.getAttribute(`data-${_pfx}`)) return true;
        cur = cur.parentElement;
    }
    return false;
}

// Combined skip check: returns true if element should be excluded
function shouldSkipElement(el, container) {
    return isInsideComment(el, container) || isInsideDropdown(el, container);
}

// Selectors for dropdown / control menu elements whose text must be excluded
const DROPDOWN_CONTENT_SELECTORS = [
    '[class*="artdeco-dropdown__content"]',
    '[class*="control-menu__content"]',
    '[class*="feed-shared-control-menu"]',
    '[class*="artdeco-dropdown__item"]',
    `[data-${_pfx}]`,
].join(", ");

// Get an element's text content EXCLUDING any dropdown/menu descendants.
// This is critical because a high-level span[dir="ltr"] may wrap both
// the post text and the dropdown — innerText would include menu items.
function getCleanText(el) {
    // Clone the element, strip all dropdown/menu descendants, read text.
    const clone = el.cloneNode(true);
    clone.querySelectorAll(DROPDOWN_CONTENT_SELECTORS).forEach(n => n.remove());
    // Also strip comment sections
    clone
        .querySelectorAll('[class*="comments-comment"], [class*="comment-item"], [class*="comments-replies"]')
        .forEach(n => n.remove());
    // Strip visually-hidden / screen-reader-only duplicates
    clone.querySelectorAll('.visually-hidden, [class*="visually-hidden"]').forEach(n => n.remove());

    // Preserve line breaks in detached DOM:
    // convert <br> and block boundaries to explicit newlines before reading text.
    clone.querySelectorAll("br").forEach(br => {
        br.replaceWith(document.createTextNode("\n"));
    });
    clone.querySelectorAll("p, div, li, section, article, h1, h2, h3, h4, h5, h6, blockquote").forEach(node => {
        if (node.firstChild) node.insertBefore(document.createTextNode("\n"), node.firstChild);
        node.appendChild(document.createTextNode("\n"));
    });

    const raw = (clone.textContent || "").replace(/\u00a0/g, " ").trim();
    if (!raw) return "";

    return raw
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function findAuthorInSection(section) {
    if (!section) return null;
    // Skip sections that are inside dropdowns/control menus
    const cls = typeof section.className === "string" ? section.className : "";
    if (
        cls.includes("artdeco-dropdown") ||
        cls.includes("control-menu__content") ||
        cls.includes("feed-shared-control-menu")
    ) {
        return null;
    }
    const badLineRe =
        /(likes this|commented on this|reposted this|repost\b|shared this|promoted|sponsored|follow\b|view .* link)/i;
    const candidates = [];

    for (const a of section.querySelectorAll('a[href*="/in/"], a[href*="/company/"]')) {
        const t = (a.innerText || "").trim().split("\n")[0].trim();
        if (!t || t.length >= 100) continue;

        const line = (a.closest("div, span, p")?.innerText || a.innerText || "").trim();
        if (badLineRe.test(line)) continue;

        let score = 0;
        if (a.href.includes("/in/")) score += 12;
        if (a.href.includes("/company/")) score += 8;
        if (a.closest('[class*="update-components-actor__meta"], [class*="feed-shared-actor__meta"]')) score += 12;
        if (a.closest('[class*="update-components-actor"], [class*="feed-shared-actor"]')) score += 8;
        if (a.closest('[class*="feed-shared-header"], [class*="update-components-header"]')) score += 3;
        if (/\b(\d(st|nd|rd|th)\+?)\b/.test(line)) score += 2; // LinkedIn degree hint often near real author
        if (/^view\s/i.test(t) || /\bgraphic link\b/i.test(t)) score -= 20;

        candidates.push({ name: t, url: a.href, score });
    }

    if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        return { name: candidates[0].name, url: candidates[0].url };
    }
    return null;
}

function extractAuthor(container) {
    // Strategy 1: Look in the actor/header section specifically
    // Try actor selectors first (these contain the actual post author),
    // then header selectors (these may contain "X commented on this").
    const actorFirst = [
        '[class*="update-components-actor__meta"]',
        '[class*="feed-shared-actor"]',
        '[class*="update-components-actor"]',
    ];
    for (const sel of actorFirst) {
        for (const actor of container.querySelectorAll(sel)) {
            if (shouldSkipElement(actor, container)) continue;
            const result = findAuthorInSection(actor);
            if (result) return result;
        }
    }
    // Then try broader header selectors
    for (const sel of ['[class*="feed-shared-header"]', '[class*="update-components-header"]']) {
        for (const actor of container.querySelectorAll(sel)) {
            if (shouldSkipElement(actor, container)) continue;
            const result = findAuthorInSection(actor);
            if (result) return result;
        }
    }

    // Strategy 2/3: Score links globally and pick strongest candidate.
    const badLineRe =
        /(likes this|commented on this|reposted this|repost\b|shared this|promoted|sponsored|follow\b|view .* link)/i;
    const globalCandidates = [];
    for (const a of container.querySelectorAll('a[href*="/in/"], a[href*="/company/"]')) {
        if (shouldSkipElement(a, container)) continue;

        const t = (a.innerText || "").trim().split("\n")[0].trim();
        if (!t || t.length >= 100) continue;
        const line = (a.closest("div, span, p")?.innerText || a.innerText || "").trim();
        if (badLineRe.test(line)) continue;

        let score = 0;
        if (a.href.includes("/in/")) score += 12;
        if (a.href.includes("/company/")) score += 8;
        if (a.closest('[class*="update-components-actor__meta"], [class*="feed-shared-actor__meta"]')) score += 12;
        if (a.closest('[class*="update-components-actor"], [class*="feed-shared-actor"]')) score += 8;
        if (a.closest('[class*="feed-shared-header"], [class*="update-components-header"]')) score += 3;
        if (/\b(\d(st|nd|rd|th)\+?)\b/.test(line)) score += 2;
        if (/^view\s/i.test(t) || /\bgraphic link\b/i.test(t)) score -= 20;

        globalCandidates.push({ name: t, url: a.href, score });
    }
    if (globalCandidates.length > 0) {
        globalCandidates.sort((a, b) => b.score - a.score);
        return { name: globalCandidates[0].name, url: globalCandidates[0].url };
    }

    return { name: "Unknown Author", url: "" };
}

function quickAuthorName(container) {
    return extractAuthor(container).name;
}

function extractPostData(container) {
    // -- Author --
    const author = extractAuthor(container);
    const authorName = author.name;
    const authorUrl = author.url;

    // -- Post text --
    // Attribute-based selectors first (resilient to class-name obfuscation),
    // then class-based as fallback.
    // Uses getCleanText() to strip dropdown / control-menu / comment text,
    // because a parent span may wrap both the post and the open dropdown.
    let postText = "";
    const textSelectors = [
        '[class*="break-words"]',
        '[class*="commentary"]',
        '[class*="feed-shared-text"]',
        '[class*="update-components-text"]',
        'span[dir="ltr"]',
    ];
    for (const sel of textSelectors) {
        try {
            for (const el of container.querySelectorAll(sel)) {
                if (shouldSkipElement(el, container)) continue;
                const t = getCleanText(el);
                if (t.length > postText.length) postText = t;
            }
        } catch (_) {}
    }
    // Structural fallback — largest text block not inside a comment or dropdown
    if (!postText) {
        for (const el of container.querySelectorAll("div, p, span")) {
            if (shouldSkipElement(el, container)) continue;
            const t = getCleanText(el);
            if (t.length > 60 && t.length > postText.length) postText = t;
        }
    }

    // -- Engagement --
    const engagement = extractEngagement(container);

    // -- Timestamp --
    let timestamp = "";
    const timeEl = container.querySelector("time");
    if (timeEl) timestamp = timeEl.getAttribute("datetime") || timeEl.innerText.trim();
    if (!timestamp) {
        const sd = container.querySelector('[class*="sub-description"] .visually-hidden');
        if (sd) timestamp = sd.innerText.trim();
    }

    // -- Post URL --
    let postUrl = "";
    const urn = container.getAttribute("data-urn") || "";
    if (urn) {
        const id = urn.split(":").pop();
        if (urn.includes("activity")) postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${id}/`;
        else if (urn.includes("ugcPost")) postUrl = `https://www.linkedin.com/feed/update/urn:li:ugcPost:${id}/`;
    }
    if (!postUrl) postUrl = window.location.href;

    // -- Images --
    // findMainImageInPost navigates the post DOM tree to collect primary
    // content image URLs.  Profile pictures, comment avatars, and icons
    // are filtered out by isValidPostImage.  The URLs are sent to the
    // background script which fetches them from the browser's disk cache
    // (force-cache mode) — no extra request reaches LinkedIn's servers.
    const imageUrls = findMainImageInPost(container);

    return {
        authorName,
        authorUrl,
        postText,
        postUrl,
        timestamp,
        engagement,
        dateSaved: new Date().toISOString(),
        imageUrls,
    };
}

// Engagement metrics extraction
//
// LinkedIn's DOM changes frequently. Instead of relying on specific selectors,
// we scan ALL text + aria-labels inside the social-details area for patterns
// like "379 reactions", "22 comments", "4 reposts", or "1,234 likes".

function extractEngagement(container) {
    let likes = 0,
        comments = 0,
        reposts = 0;

    function parseNum(str) {
        if (!str) return 0;
        const s = str.replace(/,/g, "").trim();
        // "1.2K" / "3.4M"
        const km = s.match(/(\d+(?:\.\d+)?)\s*([KkMm])/);
        if (km) return Math.round(parseFloat(km[1]) * (km[2].toLowerCase() === "k" ? 1000 : 1000000));
        const d = s.match(/\d+/);
        return d ? parseInt(d[0], 10) : 0;
    }

    const engagementRe = /(\d[\d,.]*\s*[KkMm]?)\s*(reaction|like|comment|repost|share)s?/i;

    // The data-urn container is often too narrow — the social-details bar may
    // live in a sibling or parent wrapper. Walk up to find the broadest element
    // that contains a social-details section.
    let searchRoot = container;

    // Try to find social-details inside the container first
    if (!searchRoot.querySelector('[class*="social-details"], [class*="social-counts"]')) {
        // Walk up a few levels to find a broader wrapper
        let parent = container.parentElement;
        for (let i = 0; i < 5 && parent && parent !== document.body; i++) {
            if (parent.querySelector('[class*="social-details"], [class*="social-counts"]')) {
                searchRoot = parent;
                break;
            }
            // Also check common LinkedIn wrapper classes
            const cls = typeof parent.className === "string" ? parent.className : "";
            if (cls.includes("feed-shared-update") || cls.includes("occludable-update")) {
                searchRoot = parent;
                break;
            }
            parent = parent.parentElement;
        }
    }

    // Narrow to the social-details bar if possible (avoids scanning the entire post)
    const socialBar = searchRoot.querySelector('[class*="social-details"], [class*="social-counts"]');
    const scanRoot = socialBar || searchRoot;

    const texts = new Set();

    // Check for specific reaction count elements (LinkedIn sometimes hides the word "reactions" behind an icon)
    const reactionEl = scanRoot.querySelector(
        '[class*="social-counts__reactions-count"], [data-test-id*="reaction"], button[aria-label*="reaction" i]',
    );
    if (reactionEl) {
        const label = reactionEl.getAttribute("aria-label") || reactionEl.textContent.trim();
        if (label) texts.add(label);
    }

    // Scan aria-labels in the social area
    scanRoot.querySelectorAll("[aria-label]").forEach(el => {
        texts.add(el.getAttribute("aria-label"));
    });

    // Scan visible text on interactive elements only (no divs — too heavy)
    scanRoot.querySelectorAll("button, span, a").forEach(el => {
        if (el.children.length <= 2 && el.innerText?.length < 200) {
            texts.add(el.innerText.trim());
        }
    });

    for (const t of texts) {
        if (!t) continue;
        const m = t.match(engagementRe);
        if (!m) continue;
        const count = parseNum(m[1]);
        const word = m[2];
        if (count === 0) continue;
        if (/reaction|like/i.test(word) && count > likes) likes = count;
        else if (/comment/i.test(word) && count > comments) comments = count;
        else if (/repost|share/i.test(word) && count > reposts) reposts = count;
    }

    if (likes || comments || reposts) {
        console.log("Rightclicked engagement:", { likes, comments, reposts });
    }

    return { likes, comments, reposts };
}

// ── Image Extraction ──────────────────────────────────────────
// Captures primary content images from post media containers.
// Deliberately excludes profile pictures, comment avatars, and
// icons by using a hierarchical selector + exclusion filter strategy.
// The extracted URLs are later fetched by the background script
// using the browser's local disk cache (force-cache mode) so that
// no extra request is sent to LinkedIn's servers.

// LinkedIn-specific selectors for post media containers (ordered by specificity)
const IMAGE_CONTAINER_SELECTORS = [
    '[class*="update-components-image__image-link"]',
    '[class*="update-components-image"]',
    '[class*="feed-shared-image__container"]',
    '[class*="feed-shared-image"]',
    '[class*="feed-shared-article__image"]',
];

// LinkedIn carousel / multi-image container selectors
const CAROUSEL_CONTAINER_SELECTORS = [
    '[class*="document-viewer"]',
    '[class*="feed-shared-native-document"]',
    '[class*="carousel"]',
    '[class*="multi-image"]',
    '[class*="artifact-viewer"]',
];

// CSS class fragments that identify profile pictures and avatar elements.
// NOTE: ivm-view-attr__img--centered is intentionally excluded — LinkedIn
// also applies it to post content images (alongside update-components-image__image).
const PFP_CLASS_FRAGMENTS = [
    "presence-entity__image",
    "EntityPhoto",
    "profile-picture",
    "feed-shared-actor__avatar",
    "update-components-actor__avatar",
    "feed-shared-mini-profile",
    "member-photo",
    "ghost-person",
];

// Positive whitelist: these classes are used exclusively on post content images.
// An img carrying any of these is accepted immediately, bypassing PFP filters.
const POST_IMAGE_CLASS_WHITELIST = ["update-components-image__image", "feed-shared-image__image", "evi-image"];

// Ancestor selectors that indicate an image belongs to comments, not the post body
const COMMENT_ANCESTOR_SELECTORS = [
    '[class*="comments-post-meta"]',
    '[class*="feed-shared-comment"]',
    '[class*="comments-comment"]',
    '[class*="comment-item"]',
    '[class*="comments-replies"]',
    '[class*="social-details-social-activity"]',
];

/**
 * Returns true if imgElement is a legitimate post content image:
 *   - Has a real (non-data, non-blob) src URL
 *   - Not inside a comment section
 *   - Not a profile picture or icon
 *   - At least 200 x 200 px (rendered or natural size)
 */
function isValidPostImage(imgElement) {
    if (!imgElement || imgElement.tagName !== "IMG") return false;

    const src = imgElement.src || imgElement.getAttribute("src") || "";
    // Exclude empty, inline data URIs, and temporary blob URLs — they
    // cannot be retrieved from the browser cache.
    if (!src || src.startsWith("data:") || src.startsWith("blob:")) return false;

    // Positive whitelist: if the img carries a class that LinkedIn uses
    // exclusively for post content images, accept immediately.
    const cls = typeof imgElement.className === "string" ? imgElement.className : "";
    const isExplicitPostImage = POST_IMAGE_CLASS_WHITELIST.some(c => cls.includes(c));
    if (isExplicitPostImage) {
        // Still reject images that are inside comment sections even if
        // they carry a post-image class (shouldn't happen, but be safe).
        for (const sel of COMMENT_ANCESTOR_SELECTORS) {
            try {
                if (imgElement.closest(sel)) return false;
            } catch (_) {}
        }
        return true;
    }

    // Size gate: reject icons, tiny thumbnails, and avatar-sized images.
    // Priority order:
    //   1. getBoundingClientRect — actual rendered size (most reliable)
    //   2. naturalWidth/naturalHeight — decoded intrinsic size
    //   3. HTML width/height attributes — set by LinkedIn for lazy images
    //      that haven't been decoded yet (e.g. class="lazy-image")
    const rect = imgElement.getBoundingClientRect();
    const attrW = parseInt(imgElement.getAttribute("width") || "0", 10);
    const attrH = parseInt(imgElement.getAttribute("height") || "0", 10);
    const w = Math.max(rect.width, imgElement.naturalWidth || 0, attrW);
    const h = Math.max(rect.height, imgElement.naturalHeight || 0, attrH);
    if (w < 200 || h < 200) return false;

    // Comment filter: reject images nested inside any comment container
    for (const sel of COMMENT_ANCESTOR_SELECTORS) {
        try {
            if (imgElement.closest(sel)) return false;
        } catch (_) {}
    }

    // PFP filter: walk ancestor chain for avatar/actor container classes
    let cur = imgElement.parentElement;
    while (cur && cur !== document.body) {
        const ancestorCls = typeof cur.className === "string" ? cur.className : "";
        for (const fragment of PFP_CLASS_FRAGMENTS) {
            if (ancestorCls.includes(fragment)) return false;
        }
        // PFP filter: image wrapped in a profile link ( <a href="/in/..."> )
        // but NOT a post link ( /posts/ or /feed/ )
        if (cur.tagName === "A") {
            const href = cur.getAttribute("href") || "";
            if (href.includes("/in/") && !href.includes("/posts/") && !href.includes("/feed/")) return false;
        }
        cur = cur.parentElement;
    }

    return true;
}

/**
 * Finds the primary content image(s) in a single post container.
 *
 * Strategy:
 *   1. Target known LinkedIn media container classes directly.
 *   2. Target carousel / multi-image containers.
 *   3. Fallback: scan all imgs in the post and filter with isValidPostImage.
 *
 * Returns an array of { url, alt } objects.
 * Returns multiple entries for carousel posts.
 * Returns an empty array if no valid post image is found.
 */
function findMainImageInPost(postElement) {
    if (!postElement) return [];

    const results = [];
    const seen = new Set();

    function collectFromContainer(containerEl) {
        for (const img of containerEl.querySelectorAll("img")) {
            const src = img.src || img.getAttribute("src") || "";
            if (!src || seen.has(src)) continue;
            if (!isValidPostImage(img)) continue;
            seen.add(src);
            results.push({ url: src, alt: img.alt || "" });
        }
    }

    // Strategy 1: targeted media container selectors
    for (const sel of IMAGE_CONTAINER_SELECTORS) {
        try {
            for (const container of postElement.querySelectorAll(sel)) {
                collectFromContainer(container);
            }
        } catch (_) {}
        if (results.length > 0) break; // stop after first matching selector class
    }

    // Strategy 2: carousel / multi-image containers
    if (results.length === 0) {
        for (const sel of CAROUSEL_CONTAINER_SELECTORS) {
            try {
                const carouselEl = postElement.querySelector(sel);
                if (carouselEl) collectFromContainer(carouselEl);
            } catch (_) {}
        }
    }

    // Strategy 3: fallback — scan all imgs in post and filter
    if (results.length === 0) {
        for (const img of postElement.querySelectorAll("img")) {
            const src = img.src || img.getAttribute("src") || "";
            if (!src || seen.has(src)) continue;
            if (!isValidPostImage(img)) continue;
            seen.add(src);
            results.push({ url: src, alt: img.alt || "" });
        }
    }

    return results;
}

// ── Content-script image cache fetch ─────────────────────────
// This must run in the content script, NOT the background service worker.
// Chrome's HTTP cache is partitioned by top-frame origin (Chrome 86+).
// Images loaded by the LinkedIn page are cached under linkedin.com as the
// top-frame.  A service worker fetch uses chrome-extension:// as the
// top-frame and therefore hits a completely different cache partition,
// always missing.  Running fetch() here shares the page's cache partition.

// Maximum pixel dimension for stored images (longest edge).
// Images larger than this are scaled down proportionally before
// JPEG re-encoding.  1200 px is large enough for any dashboard
// use-case while keeping stored base64 strings compact.
const IMAGE_MAX_DIMENSION = 1200;

// JPEG quality used for Canvas re-encoding (0–1).
// 0.82 retains clear text/detail in LinkedIn post images while
// typically reducing size by 40–60 % vs a raw PNG or WebP blob.
const IMAGE_JPEG_QUALITY = 0.82;

/**
 * Compresses an image Blob using the Canvas API.
 *
 * Steps:
 *   1. Decode blob → ImageBitmap (no <img> element, no DOM insertion).
 *   2. Scale down if the longest edge exceeds IMAGE_MAX_DIMENSION.
 *   3. Draw onto an OffscreenCanvas (worker-safe; falls back to a
 *      regular <canvas> which is also available in content scripts).
 *   4. Return as a JPEG data-URI at IMAGE_JPEG_QUALITY.
 *
 * Falls back to raw FileReader base64 if Canvas APIs are unavailable
 * or the image cannot be decoded (e.g. SVG without explicit dimensions).
 */
async function compressImageBlob(blob) {
    try {
        const bitmap = await createImageBitmap(blob);
        const ow = bitmap.width;
        const oh = bitmap.height;

        // Proportional down-scale
        const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(ow, oh));
        const w = Math.round(ow * scale);
        const h = Math.round(oh * scale);

        // Prefer OffscreenCanvas (no DOM side-effects); fall back to <canvas>
        let canvas;
        if (typeof OffscreenCanvas !== "undefined") {
            canvas = new OffscreenCanvas(w, h);
        } else {
            canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
        }

        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0, w, h);
        bitmap.close(); // free GPU memory immediately

        if (canvas instanceof OffscreenCanvas) {
            const compressedBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: IMAGE_JPEG_QUALITY });
            return await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => reject(new Error("FileReader error"));
                reader.readAsDataURL(compressedBlob);
            });
        } else {
            // HTMLCanvasElement.toDataURL is synchronous
            return canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY);
        }
    } catch {
        // Canvas decode failed (e.g. SVG, CORS-tainted canvas) —
        // fall back to lossless raw blob encoding.
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("FileReader error"));
            reader.readAsDataURL(blob);
        });
    }
}

async function fetchImagesFromCache(imageList) {
    const results = [];
    for (let i = 0; i < imageList.length; i++) {
        const { url, alt } = imageList[i];
        try {
            const res = await fetch(url, {
                method: "GET",
                // force-cache: use the browser's disk cache; only fall back to
                // the network if the resource is genuinely missing from cache.
                cache: "force-cache",
                // omit: do not attach LinkedIn session cookies to this request
                // so that even a cache-miss network fetch is not authenticated.
                credentials: "omit",
            });
            if (!res.ok) {
                results.push({ url, alt: alt || "", base64: null });
                continue;
            }
            const blob = await res.blob();
            if (!blob || blob.size === 0) {
                results.push({ url, alt: alt || "", base64: null });
                continue;
            }
            // Compress via Canvas before encoding to base64.
            // This reduces MongoDB document size by ~40–60 % compared to
            // storing the raw blob, and caps the longest dimension at
            // IMAGE_MAX_DIMENSION px so oversized images are stored consistently.
            const base64 = await compressImageBlob(blob);
            results.push({ url, alt: alt || "", base64: base64 || null });
        } catch {
            results.push({ url, alt: alt || "", base64: null });
        }
        // Randomised delay between sequential fetches to prevent burst patterns.
        if (i < imageList.length - 1) {
            await new Promise(r => setTimeout(r, 200 + Math.floor(Math.random() * 300)));
        }
    }
    return results;
}

// 3) Safe messaging

function safeSendMessage(msg, cb) {
    if (!isContextValid()) {
        showToast(false, "Extension updated -- please reload this page");
        if (cb) cb(null);
        return;
    }
    try {
        chrome.runtime.sendMessage(msg, response => {
            if (chrome.runtime.lastError) {
                console.warn("Rightclicked:", chrome.runtime.lastError.message);
                if (cb) cb(null);
                return;
            }
            if (cb) cb(response);
        });
    } catch (_) {
        showToast(false, "Extension disconnected -- please reload this page");
        if (cb) cb(null);
    }
}

// 4) Context-menu extraction + notification handler

let lastRightClickedElement = null;
let lastRightClickedContainer = null;
let lastRightClickPostData = null;
let lastRightClickTs = 0;
let lastPointerElement = null;
let lastPointerTs = 0;
let _lastRightClickTimeout = null;
let _lastPointerSampleTs = 0;

document.addEventListener(
    "mousemove",
    e => {
        const now = Date.now();
        if (now - _lastPointerSampleTs < 180) return;
        _lastPointerSampleTs = now;
        lastPointerElement = e.target;
        lastPointerTs = now;
    },
    true,
);

document.addEventListener("contextmenu", e => {
    lastRightClickedElement = e.target;
    lastRightClickedContainer = findPostContainer(e.target);
    lastRightClickTs = Date.now();
    if (lastRightClickedContainer) {
        const pre = extractPostData(lastRightClickedContainer);
        if (pre?.postText) {
            lastRightClickPostData = pre;
        }
    }
    clearTimeout(_lastRightClickTimeout);
    _lastRightClickTimeout = setTimeout(() => {
        lastRightClickedElement = null;
        lastRightClickedContainer = null;
        lastRightClickPostData = null;
    }, 10000);
});

function isGoodExtraction(data) {
    if (!data || !data.postText) return false;
    if (data.postText.length < 40) return false;
    if (!data.authorName || /unknown author/i.test(data.authorName)) return false;
    return true;
}

function resolveBestContainer({ source = "unknown", preferredContainer = null } = {}) {
    const candidates = [];
    if (preferredContainer) candidates.push(preferredContainer);

    if (source === "context-menu") {
        if (lastRightClickedContainer && document.contains(lastRightClickedContainer)) {
            candidates.push(lastRightClickedContainer);
        }
        if (lastRightClickedElement && document.contains(lastRightClickedElement)) {
            const fromTarget = findPostContainer(lastRightClickedElement);
            if (fromTarget) candidates.push(fromTarget);
        }
    }

    // For popup and menu flows, prefer what user was most recently hovering.
    if ((source === "popup" || source === "menu-injected") && lastPointerElement && Date.now() - lastPointerTs < 8000) {
        const fromPointer = findPostContainer(lastPointerElement);
        if (fromPointer) candidates.push(fromPointer);
    }

    const visible = findMostVisiblePost();
    if (visible) candidates.push(visible);
    for (const c of getAllPostContainers().slice(0, 24)) {
        if (isElementMostlyVisible(c)) candidates.push(c);
    }

    const seen = new Set();
    let best = null;
    let bestScore = -1;

    for (const c of candidates) {
        if (!c || seen.has(c)) continue;
        seen.add(c);

        const data = extractPostData(c);
        if (!data?.postText) continue;

        let score = Math.min(data.postText.length, 8000) / 100;
        if (data.authorName && !/unknown author/i.test(data.authorName)) score += 20;
        if (data.postUrl?.includes("/feed/update/")) score += 5;
        if (isElementMostlyVisible(c)) score += 20;

        const r = c.getBoundingClientRect();
        const center = window.innerHeight / 2;
        const mid = (r.top + r.bottom) / 2;
        const dist = Math.abs(mid - center);
        score += Math.max(0, 18 - dist / 40);

        if (source === "context-menu" && c === lastRightClickedContainer && Date.now() - lastRightClickTs < 20_000) {
            score += 30;
        }

        if (score > bestScore) {
            bestScore = score;
            best = c;
        }
    }

    return best;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "extractPost") {
        // Source-aware extraction:
        // - context-menu: prefer the exact right-clicked element
        // - popup: always use currently visible post
        // - fallback: best effort
        const source = message.source || "unknown";

        // Fast path: for context-menu saves, use extraction captured at right-click time.
        if (
            source === "context-menu" &&
            lastRightClickPostData &&
            Date.now() - lastRightClickTs < 20_000 &&
            isGoodExtraction(lastRightClickPostData)
        ) {
            sendResponse({ postData: lastRightClickPostData, cached: true });
            return true;
        }

        let container = null;
        if (source === "context-menu") {
            container = resolveBestContainer({ source, preferredContainer: lastRightClickedContainer });
        } else if (source === "popup") {
            container = resolveBestContainer({ source });
        } else {
            container = resolveBestContainer({ source });
        }

        if (container) {
            const data = extractPostData(container);
            if (!data.postText) {
                sendResponse({ error: "Could not extract post content" });
                return true;
            }
            // If engagement is all zeros, LinkedIn may not have rendered the social
            // bar yet. Retry once after a short delay to give it time to load.
            const eng = data.engagement;
            if (!eng.likes && !eng.comments && !eng.reposts) {
                setTimeout(() => {
                    data.engagement = extractEngagement(container);
                    sendResponse({ postData: data });
                }, 600);
                return true; // keep message channel open for async response
            }
            sendResponse({ postData: data });
        } else {
            sendResponse({ error: "No LinkedIn post found" });
        }
        return true;
    }
    if (message.action === "showNotification") {
        showToast(message.success, message.message);
    }
    if (message.action === "fetchImages") {
        // Called by the background after a successful text save.
        // Runs here (page context) so cache: 'force-cache' hits the same HTTP
        // cache partition that the LinkedIn page populated.
        const { imageUrls } = message;
        if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
            sendResponse({ images: [] });
            return true;
        }
        fetchImagesFromCache(imageUrls)
            .then(images => sendResponse({ images }))
            .catch(() => sendResponse({ images: [] }));
        return true; // keep channel open for async response
    }
});

// 5) Toast — inline styles only (no injected CSS classes to fingerprint)

function showToast(success, text) {
    const existing = document.querySelector(`[data-${_pfx}-t]`);
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.setAttribute(`data-${_pfx}-t`, "1");
    Object.assign(el.style, {
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: "2147483647",
        padding: "12px 20px",
        borderRadius: "8px",
        fontSize: "13px",
        fontWeight: "600",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        color: "#fff",
        background: success ? "#057642" : "#cc1016",
        border: "1px solid rgba(255,255,255,0.15)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        opacity: "0",
        transform: "translateY(16px)",
        transition: "opacity 0.3s, transform 0.3s",
    });
    el.textContent = text;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
    });
    setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateY(16px)";
        setTimeout(() => el.remove(), 300);
    }, 4500);
}

// 6) Save a post — called when user clicks our dropdown option or context menu

function savePostFromUI(container) {
    if (!isContextValid()) {
        showToast(false, "Extension updated — please reload this page");
        return;
    }
    let postData = extractPostData(container);
    if (!postData?.postText) {
        const fallback = resolveBestContainer({ source: "save-ui", preferredContainer: container });
        if (fallback) postData = extractPostData(fallback);
    }
    if (!postData.postText) {
        showToast(false, "Couldn't extract post content");
        return;
    }
    const authorShort = postData.authorName.length > 30 ? postData.authorName.slice(0, 30) + "…" : postData.authorName;

    showToast(true, "Saving…");
    trackEvent("save_attempt");
    const startTime = Date.now();

    safeSendMessage({ action: "savePost", postData }, response => {
        const timeMs = Date.now() - startTime;
        if (!response) {
            trackEvent("save_failure", { timeMs, reason: "no_response" });
            showToast(false, "Error — reload page");
            return;
        }
        if (response.success) {
            trackEvent("save_success", { timeMs });
            const suffix = response.accountLabel ? ` to ${response.accountLabel}` : "";
            showToast(true, `Saved post by ${authorShort}${suffix}`);
        } else if (response.error?.includes("already")) {
            showToast(true, "Post already saved");
        } else {
            trackEvent("save_failure", { timeMs, reason: response.error });
            const msg =
                response.error?.includes("logged") || response.error?.includes("log in")
                    ? "Not logged in — open Rightclicked popup"
                    : "Save failed";
            showToast(false, msg);
        }
    });
}

// Analytics event tracker

function trackEvent(event, meta) {
    chrome.storage.local.get("token", ({ token }) => {
        if (!token) return;
        fetch("https://rightclicked-backend.vercel.app/api/analytics/event", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ event, meta: meta || {} }),
        }).catch(() => {});
    });
}

// 7) Event-delegation injection ────────────────────────────────
//
// Instead of a MutationObserver watching document.body (detectable
// by LinkedIn's "Watchdog" monitor) or fixed-interval scanning
// (behavioral flatline), we use a single click listener.
//
// When the user clicks LinkedIn's 3-dot menu, we wait for the
// dropdown to render and inject our save option on-demand.
// This means:
//   • ZERO background DOM scanning
//   • ZERO fixed intervals
//   • No injected elements until the user explicitly interacts
//   • Only the one post the user is engaging with is processed

document.addEventListener(
    "click",
    function _rcClick(e) {
        if (!isContextValid() || !isTabVisible()) return;
        if (!SCRAPING_POLICY.isAllowed()) return;

        // Detect click on any 3-dot menu trigger.
        // LinkedIn uses different patterns for organic, suggested, and ad posts,
        // so we match broadly and verify it's a post menu once the dropdown renders.
        const trigger = e.target.closest(
            [
                'button[aria-label*="control menu" i]',
                'button[aria-label*="more action" i]',
                'button[aria-label*="overflow" i]',
                // Artdeco / Ember dropdown triggers (class-based fallback)
                '[class*="artdeco-dropdown__trigger"]',
                '[class*="control-menu__trigger"]',
            ].join(", "),
        );
        if (!trigger) return;

        // Quick guard: skip triggers that are clearly NOT post menus
        // (e.g. messaging, nav bar, composer toolbars).
        // Note: avoid broad substring guards like [class*="nav-"] — LinkedIn
        // wraps feed content in layout divs whose classes contain "nav-".
        if (
            trigger.closest(
                'header, nav, [role="navigation"], [class*="msg-overlay"], [class*="msg-thread"], [class*="share-box"], [class*="share-creation"]',
            )
        )
            return;

        if (!RateLimiter.canAct()) return;
        RateLimiter.record();

        // Poll for the dropdown to render instead of a single timeout.
        // LinkedIn's Ember renders the menu items asynchronously after the click.
        // We pass the trigger so we can resolve the post container lazily on save.
        _waitForDropdown(trigger, 0);
    },
    true,
); // capture phase

// Walk up from the trigger to find the artdeco-dropdown CONTAINER.
// We cannot use trigger.closest('[class*="artdeco-dropdown"]') because
// the trigger button itself has class "artdeco-dropdown__trigger" which
// contains the substring "artdeco-dropdown" and would match itself.
function _findDropdownContainer(trigger) {
    let el = trigger.parentElement;
    while (el && el !== document.body) {
        if (el.classList && el.classList.contains("artdeco-dropdown")) {
            return el;
        }
        el = el.parentElement;
    }
    return trigger.parentElement;
}

// Find the dropdown content panel associated with the trigger.
function _findContentPanel(trigger, dropdown) {
    // 1. aria-controls (most reliable if present)
    const controlsId = trigger.getAttribute("aria-controls");
    if (controlsId) {
        const panel = document.getElementById(controlsId);
        if (panel) return panel;
    }
    // 2. Inside the dropdown container — look for the content div
    if (dropdown) {
        const local =
            dropdown.querySelector('[class*="dropdown__content"]') ||
            dropdown.querySelector('[class*="control-menu__content"]');
        if (local) return local;
    }
    // 3. Next sibling of the trigger (some Ember renders)
    if (trigger.nextElementSibling) {
        const cls = trigger.nextElementSibling.className || "";
        if (cls.includes("dropdown") || cls.includes("control-menu")) {
            return trigger.nextElementSibling;
        }
    }
    return null;
}

// Check if a content panel contains post-menu items.
function _isPostMenuContent(panel) {
    if (!panel || panel.children.length === 0) return false;
    const text = (panel.textContent || "").toLowerCase();
    return (
        text.includes("copy link") ||
        text.includes("embed") ||
        text.includes("not interested") ||
        text.includes("report") ||
        text.includes("save")
    );
}

// Try to inject into the content panel if it's ready.
// Returns true if injection happened or panel already has our button.
function _tryInject(panel, trigger, dropdown) {
    if (!panel || panel.children.length === 0) return false;
    if (panel.querySelector(`[data-${_pfx}]`)) return true; // already injected
    if (!_isPostMenuContent(panel)) return false;
    _injectSaveOption(panel, trigger, dropdown);
    return true;
}

function _waitForDropdown(trigger, attempt) {
    if (attempt > 40) return; // give up after ~4 s

    const dropdown = _findDropdownContainer(trigger);
    if (!dropdown) return;

    const panel = _findContentPanel(trigger, dropdown);

    // If we found a panel and it already has our button, we're done.
    if (panel && panel.querySelector(`[data-${_pfx}]`)) return;

    // Try to inject immediately if panel has content.
    if (_tryInject(panel, trigger, dropdown)) return;

    // Panel exists but is empty — attach a one-shot MutationObserver
    // to react the instant Ember renders the menu items.
    if (panel && attempt === 0) {
        const observer = new MutationObserver(() => {
            if (_tryInject(panel, trigger, dropdown)) {
                observer.disconnect();
            }
        });
        observer.observe(panel, { childList: true, subtree: true });
        // Auto-disconnect after 5 s to avoid leaks.
        setTimeout(() => observer.disconnect(), 5000);
    }

    // Also keep polling as a backup (handles Ember element replacement, portals, etc.).
    const delay = 80 + Math.floor(Math.random() * 40);
    setTimeout(() => _waitForDropdown(trigger, attempt + 1), delay);
}

function _injectSaveOption(content, trigger, dropdown) {
    // Already injected?
    if (dropdown && dropdown.querySelector(`[data-${_pfx}]`)) return;
    if (content.querySelector(`[data-${_pfx}]`)) return;

    // Find the list container — LinkedIn uses ul, role="list", role="menu", or bare divs
    const list =
        content.querySelector("ul") ||
        content.querySelector('[role="list"]') ||
        content.querySelector('[role="menu"]') ||
        content;

    // Auto-detect element tag to match LinkedIn's existing menu items
    const hasLi = !!list.querySelector("li");
    const tagName = hasLi ? "li" : "div";

    // Build menu item using inline styles only — no CSS classes injected
    const menuItem = document.createElement(tagName);
    menuItem.setAttribute(`data-${_pfx}`, "1");
    menuItem.setAttribute("role", "menuitem");

    const inner = document.createElement("div");
    inner.tabIndex = 0;
    Object.assign(inner.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 24px 10px 16px",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "400",
        color: "rgba(0,0,0,0.9)",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        whiteSpace: "nowrap",
        lineHeight: "20px",
        minHeight: "40px",
        boxSizing: "border-box",
        transition: "background 0.15s ease",
    });
    inner.addEventListener("mouseenter", () => {
        inner.style.background = "rgba(0,0,0,0.08)";
    });
    inner.addEventListener("mouseleave", () => {
        inner.style.background = "transparent";
    });

    // Bookmark icon (inline SVG, no external resources)
    const icon = document.createElement("span");
    Object.assign(icon.style, {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "20px",
        height: "20px",
        color: "rgba(0,0,0,0.6)",
        flexShrink: "0",
    });
    icon.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="currentColor">' +
        '<path d="M13 2.5H3a.5.5 0 00-.5.5v10.69l4.72-3.15a.5.5 0 01.56 0L12.5 13.69V3a.5.5 0 00-.5-.5z' +
        'M3 1h10a2 2 0 012 2v12a.5.5 0 01-.78.42L8 11.28l-6.22 4.14A.5.5 0 011 15V3a2 2 0 012-2z"/></svg>';

    const label = document.createElement("span");
    label.textContent = "Save to Rightclicked";

    inner.appendChild(icon);
    inner.appendChild(label);
    menuItem.appendChild(inner);

    // Use capture phase + stopImmediatePropagation to ensure our handler fires
    // before LinkedIn's own dropdown handlers can intercept and close the menu.
    let _saveHandled = false;
    function handleSaveClick(ev) {
        if (_saveHandled) return;
        _saveHandled = true;
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();

        // Close the dropdown first so its text doesn't pollute extraction.
        try {
            const escEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
            (trigger || document).dispatchEvent(escEvent);
        } catch (_) {}

        // Resolve the container from the menu trigger first so we save the
        // exact post whose menu the user opened, not another visible post.
        // We delay slightly to let the dropdown close and clear the DOM.
        setTimeout(() => {
            const container = resolveBestContainer({
                source: "menu-injected",
                preferredContainer: findPostContainer(trigger) || findPostContainer(content),
            });
            if (!container) {
                showToast(false, "No LinkedIn post found");
                return;
            }
            savePostFromUI(container);
        }, 200);
    }
    inner.addEventListener("click", handleSaveClick, true);
    menuItem.addEventListener("click", handleSaveClick, true);

    // Insert after "Copy link" / "Embed" for a native look.
    // LinkedIn uses li, [role=menuitem], or bare div children depending on rendering path.
    const allItems = [...list.querySelectorAll('li, [role="menuitem"]')];
    if (allItems.length === 0) {
        // Bare div/span children (Ember rendering)
        for (const child of list.children) {
            if (child.nodeType === Node.ELEMENT_NODE) allItems.push(child);
        }
    }
    // Prefer placing after "Embed" or "Copy link"
    const anchorItem = allItems.find(item => {
        const t = (item.textContent || "").toLowerCase();
        return t.includes("embed") || t.includes("copy link");
    });
    // Fallback: place after LinkedIn's own "Save" option
    const saveItem =
        !anchorItem &&
        allItems.find(item => {
            const t = (item.textContent || "").trim().toLowerCase();
            return (t === "save" || t.startsWith("save")) && !t.includes("rightclicked");
        });
    const insertAfter = anchorItem || saveItem;
    if (insertAfter && insertAfter.parentElement) {
        insertAfter.after(menuItem);
    } else {
        list.appendChild(menuItem);
    }
}

console.log("Rightclicked content script loaded");
