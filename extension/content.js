// Rightclicked -- LinkedIn post saver content script

// Extension context validity check
function isContextValid() {
    try {
        return !!chrome.runtime?.id;
    } catch {
        return false;
    }
}

// 1) Post container detection

const POST_SELECTORS = [
    '[data-urn*="urn:li:activity"]',
    '[data-urn*="urn:li:ugcPost"]',
    '[data-urn*="urn:li:share"]',
    ".feed-shared-update-v2",
    ".occludable-update",
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
    return out;
}

function findPostContainer(el) {
    if (!el) return null;
    let cur = el;
    while (cur && cur !== document.body) {
        const urn = cur.getAttribute?.("data-urn") || "";
        if (urn && (urn.includes("activity") || urn.includes("ugcPost") || urn.includes("share"))) return cur;
        const cls = typeof cur.className === "string" ? cur.className : "";
        if (cls.includes("feed-shared-update") || cls.includes("occludable-update")) return cur;
        cur = cur.parentElement;
    }
    for (const c of getAllPostContainers()) {
        if (c.contains(el)) return c;
    }
    return null;
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

function findAuthorInSection(section) {
    if (!section) return null;
    for (const a of section.querySelectorAll('a[href*="/in/"], a[href*="/company/"]')) {
        const t = a.innerText.trim().split("\n")[0].trim();
        if (t.length > 0 && t.length < 100) {
            return { name: t, url: a.href };
        }
    }
    return null;
}

function extractAuthor(container) {
    // Strategy 1: Look in the actor/header section specifically
    for (const sel of ACTOR_SELECTORS) {
        const actor = container.querySelector(sel);
        const result = findAuthorInSection(actor);
        if (result) return result;
    }

    // Strategy 2: Find first /in/ or /company/ link that is NOT inside a comment
    for (const a of container.querySelectorAll('a[href*="/in/"], a[href*="/company/"]')) {
        if (isInsideComment(a, container)) continue;
        const t = a.innerText.trim().split("\n")[0].trim();
        if (t.length > 0 && t.length < 100) {
            return { name: t, url: a.href };
        }
    }

    // Strategy 3: Fallback -- first link anywhere
    for (const a of container.querySelectorAll('a[href*="/in/"], a[href*="/company/"]')) {
        const t = a.innerText.trim().split("\n")[0].trim();
        if (t.length > 0 && t.length < 100) {
            return { name: t, url: a.href };
        }
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
    let postText = "";
    const candidates = [
        ...container.querySelectorAll('[class*="break-words"]'),
        ...container.querySelectorAll('[class*="commentary"]'),
        ...container.querySelectorAll('span[dir="ltr"]'),
        ...container.querySelectorAll('[class*="feed-shared-text"]'),
        ...container.querySelectorAll('[class*="update-components-text"]'),
    ];
    for (const el of candidates) {
        const t = el.innerText.trim();
        if (t.length > postText.length) postText = t;
    }
    if (!postText) {
        container.querySelectorAll("div, p, span").forEach(el => {
            const t = el.innerText.trim();
            if (t.length > 60 && t.length > postText.length) postText = t;
        });
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

    return { authorName, authorUrl, postText, postUrl, timestamp, engagement, dateSaved: new Date().toISOString() };
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

    const texts = new Set();

    // Scan aria-labels on ALL elements in the search root
    searchRoot.querySelectorAll("[aria-label]").forEach(el => {
        texts.add(el.getAttribute("aria-label"));
    });

    // Scan visible text on buttons, spans, links
    searchRoot.querySelectorAll("button, span, a, div").forEach(el => {
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
document.addEventListener("contextmenu", e => {
    lastRightClickedElement = e.target;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "extractPost") {
        const container = findPostContainer(lastRightClickedElement || document.body);
        if (container) {
            const data = extractPostData(container);
            sendResponse(data.postText ? { postData: data } : { error: "Could not extract post content" });
        } else {
            sendResponse({ error: "No LinkedIn post found at click location" });
        }
    }
    if (message.action === "showNotification") {
        showToast(message.success, message.message);
    }
});

// 5) Toast

function showToast(success, text) {
    const old = document.querySelector(".rc-toast");
    if (old) old.remove();
    const el = document.createElement("div");
    el.className = "rc-toast" + (success ? " rc-toast--ok" : " rc-toast--err");
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

// 6) Save-button click handler

function handleSaveClick(btn, container) {
    if (!isContextValid()) {
        showToast(false, "Extension updated -- please reload this page");
        return;
    }
    const startTime = Date.now();
    const postData = extractPostData(container);
    if (!postData.postText) {
        btn.textContent = "No text found";
        btn.classList.add("rc-save-btn--error");
        setTimeout(() => {
            btn.textContent = "Save";
            btn.classList.remove("rc-save-btn--error");
        }, 2000);
        return;
    }
    const authorShort =
        postData.authorName.length > 25 ? postData.authorName.slice(0, 25) + "..." : postData.authorName;
    btn.textContent = "Saving...";
    btn.disabled = true;

    // Track save attempt
    trackEvent("save_attempt");

    safeSendMessage({ action: "savePost", postData }, response => {
        const timeMs = Date.now() - startTime;
        if (!response) {
            trackEvent("save_failure", { timeMs, reason: "no_response" });
            btn.textContent = "Error -- reload page";
            btn.classList.add("rc-save-btn--error");
            setTimeout(() => {
                btn.textContent = `Save \u00b7 ${authorShort}`;
                btn.classList.remove("rc-save-btn--error");
                btn.disabled = false;
            }, 3000);
            return;
        }
        if (response.success) {
            trackEvent("save_success", { timeMs });
            btn.textContent = `Saved \u00b7 ${authorShort}`;
            btn.classList.add("rc-save-btn--saved");
            btn.disabled = true;
        } else if (response.error?.includes("already")) {
            btn.textContent = "Already saved";
            btn.classList.add("rc-save-btn--saved");
            btn.disabled = true;
            // Silently update engagement for the already-saved post
            silentEngagementUpdate(container, postData.postUrl);
        } else {
            trackEvent("save_failure", { timeMs, reason: response.error });
            const errMsg =
                response.error?.includes("logged") || response.error?.includes("log in") ? "Not logged in" : "Failed";
            btn.textContent = errMsg;
            btn.classList.add("rc-save-btn--error");
            if (errMsg === "Not logged in") {
                showToast(false, "Open the Rightclicked popup to log in first");
            }
            setTimeout(() => {
                btn.textContent = `Save \u00b7 ${authorShort}`;
                btn.classList.remove("rc-save-btn--error");
                btn.disabled = false;
            }, 3000);
        }
    });
}

// Analytics event tracker

function trackEvent(event, meta) {
    chrome.storage.local.get("token", ({ token }) => {
        if (!token) return;
        fetch("http://localhost:3001/api/analytics/event", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ event, meta: meta || {} }),
        }).catch(() => {});
    });
}

// 6b) Silent engagement update for already-saved posts

function silentEngagementUpdate(container, postUrl) {
    if (!postUrl || !isContextValid()) return;
    const engagement = extractEngagement(container);
    if (engagement.likes === 0 && engagement.comments === 0 && engagement.reposts === 0) return;
    safeSendMessage({ action: "updateEngagement", postUrl, engagement }, () => {});
}

// 6c) Periodic engagement scan — checks saved posts and pushes fresh numbers

const engagementUpdated = new Set(); // track postUrls we already updated this session

function getPostUrlFromContainer(container) {
    const urn = container.getAttribute("data-urn") || "";
    if (urn) {
        const id = urn.split(":").pop();
        if (urn.includes("activity")) return `https://www.linkedin.com/feed/update/urn:li:activity:${id}/`;
        if (urn.includes("ugcPost")) return `https://www.linkedin.com/feed/update/urn:li:ugcPost:${id}/`;
    }
    return "";
}

function scanAndUpdateEngagement() {
    if (!isContextValid()) return;
    const posts = getAllPostContainers();
    for (const post of posts) {
        // Check if this post has been saved (button shows "Saved" / "Already saved")
        const btn = post.querySelector(".rc-save-btn");
        const isSaved = btn && btn.classList.contains("rc-save-btn--saved");

        let postUrl = getPostUrlFromContainer(post);

        // On single-post pages there might be no data-urn on the container —
        // fall back to the page URL itself if it looks like a post URL
        if (!postUrl) {
            const loc = window.location.href.split("?")[0].split("#")[0];
            if (loc.includes("/feed/update/") || loc.includes("/posts/")) {
                postUrl = loc.endsWith("/") ? loc : loc + "/";
            }
        }

        if (!postUrl || engagementUpdated.has(postUrl)) continue;

        // On a single-post page, always try the update — we don't know
        // if the button is marked saved yet (the user may have landed here from "Open LinkedIn")
        const isSinglePostPage =
            window.location.href.includes("/feed/update/") || window.location.href.includes("/posts/");
        if (!isSaved && !isSinglePostPage) continue;

        engagementUpdated.add(postUrl);
        silentEngagementUpdate(post, postUrl);
    }
}

// Run engagement scan every 15 seconds while browsing
setInterval(scanAndUpdateEngagement, 15000);
// Also run shortly after page load (covers "Open LinkedIn" case)
setTimeout(scanAndUpdateEngagement, 3000);
setTimeout(scanAndUpdateEngagement, 8000);

// 7) Inject save buttons on posts

function injectSaveButtons() {
    if (!isContextValid()) return;
    const posts = getAllPostContainers();
    let injected = 0;

    for (const post of posts) {
        if (post.querySelector(".rc-save-btn")) continue;

        const text = post.innerText || "";
        if (text.length < 50) continue;

        const author = quickAuthorName(post);
        const authorShort = author.length > 25 ? author.slice(0, 25) + "..." : author;

        const btn = document.createElement("button");
        btn.className = "rc-save-btn";
        btn.textContent = `Save \u00b7 ${authorShort}`;
        btn.title = `Save post by ${author} to Rightclicked`;
        btn.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            handleSaveClick(btn, post);
        });

        // Try to anchor near the social-actions bar
        const anchor =
            post.querySelector('[class*="social-action"]') ||
            post.querySelector('[class*="social-detail"]') ||
            post.querySelector('[class*="feed-shared-social"]') ||
            post.querySelector('button[aria-label*="Like"]')?.closest("div") ||
            post.querySelector('button[aria-label*="like"]')?.closest("div") ||
            null;

        if (anchor && anchor.parentElement) {
            anchor.parentElement.insertBefore(btn, anchor.nextSibling);
        } else {
            post.style.position = "relative";
            post.appendChild(btn);
        }
        injected++;
    }
    if (injected > 0) console.log(`Rightclicked: injected ${injected} save button(s)`);
}

// 8) Observers

let debounceTimer = null;
function debouncedInject() {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
        debounceTimer = null;
        injectSaveButtons();
    }, 800);
}

// Initial injection (delayed to let LinkedIn render)
setTimeout(injectSaveButtons, 2000);
setTimeout(injectSaveButtons, 5000);

// Watch for new posts (infinite scroll / SPA navigation)
const observer = new MutationObserver(debouncedInject);
observer.observe(document.body, { childList: true, subtree: true });

// Also inject on scroll (catches lazy-rendered posts)
let scrollTimer = null;
window.addEventListener(
    "scroll",
    () => {
        if (scrollTimer) return;
        scrollTimer = setTimeout(() => {
            scrollTimer = null;
            injectSaveButtons();
        }, 1200);
    },
    { passive: true },
);

console.log("Rightclicked content script loaded");
