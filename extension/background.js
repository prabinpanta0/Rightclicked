// const API_BASE = "https://rightclicked-backend.vercel.app/api";
// const FRONTEND_BASE = "https://rightclicked.vercel.app";
const API_BASE = "http://localhost:3001/api";
const FRONTEND_BASE = "http://localhost:5173";
const ACCOUNT_CACHE_TTL_MS = 5 * 60 * 1000;

const AccountCache = {
    token: null,
    label: null,
    expiresAt: 0,
};

// ---------- Global rate limiter (shared across all tabs) ----------

const GlobalRateLimit = {
    _actions: [],
    _MAX_PER_WINDOW: 60,
    _WINDOW_MS: 60_000,
    _backoffUntil: 0,

    canAct() {
        const now = Date.now();
        if (now < this._backoffUntil) return false;
        this._actions = this._actions.filter(t => now - t < this._WINDOW_MS);
        return this._actions.length < this._MAX_PER_WINDOW;
    },

    record() {
        this._actions.push(Date.now());
    },

    backoff(seconds = 30) {
        this._backoffUntil = Date.now() + seconds * 1000;
    },
};

// ---------- Context menu ----------

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "save-to-rightclicked",
        title: "Save to Rightclicked",
        contexts: ["all"],
        documentUrlPatterns: ["https://www.linkedin.com/*"],
    });
});

// All extraction is delegated to content.js — single source of truth for the DOM.
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== "save-to-rightclicked") return;

    if (!GlobalRateLimit.canAct()) {
        notifyTab(tab.id, false, "Too many saves — please wait a minute");
        return;
    }
    GlobalRateLimit.record();

    chrome.tabs.sendMessage(tab.id, { action: "extractPost", source: "context-menu" }, async resp => {
        if (chrome.runtime.lastError || !resp?.postData) {
            notifyTab(tab.id, false, "Could not find post content here.");
            return;
        }
        const result = await savePost(resp.postData, tab.id);
        const successMessage = result.accountLabel
            ? `Saved post by ${resp.postData.authorName} to ${result.accountLabel}`
            : `Saved post by ${resp.postData.authorName}`;
        notifyTab(tab.id, result.success, result.success ? successMessage : result.error);
    });
});

// ---------- Message listener ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "savePost") {
        if (!GlobalRateLimit.canAct()) {
            sendResponse({ success: false, error: "Rate limit — please wait" });
            return true;
        }
        GlobalRateLimit.record();
        // msg.tabId is set by popup.js; sender.tab?.id is set when the
        // message originates from a content script (dropdown menu button).
        const tabId = msg.tabId || sender.tab?.id || null;
        savePost(msg.postData, tabId).then(sendResponse);
        return true;
    }
    if (msg.action === "getStatus") {
        getAuthStatus().then(sendResponse);
        return true;
    }
    if (msg.action === "updateEngagement") {
        updateEngagement(msg.postUrl, msg.engagement).then(sendResponse);
        return true;
    }
    if (msg.action === "openFrontendLogin") {
        chrome.tabs.create({ url: `${FRONTEND_BASE}/connect-extension` });
        sendResponse({ success: true });
        return true;
    }
    if (msg.action === "logout") {
        chrome.storage.local.remove("token");
        sendResponse({ success: true });
        return true;
    }
    if (msg.action === "fetchPostImages") {
        // Explicit image-fetch request from the content script.
        // Also called internally by savePost() as a side effect.
        handleImageRequest(msg)
            .then(sendResponse)
            .catch(() => sendResponse({ success: false }));
        return true;
    }
});

// ---------- Extension auth: watch for token callback from frontend ----------

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo.url) return;
    const url = changeInfo.url;
    if (url.startsWith(`${FRONTEND_BASE}/extension-connected`)) {
        try {
            const u = new URL(url);
            const token = u.searchParams.get("token");
            if (token) {
                chrome.storage.local.set({ token }, () => {
                    chrome.tabs.remove(tabId).catch(() => {});
                });
            }
        } catch (_) {}
    }
});

// ---------- API helpers ----------

async function savePost(postData, tabId = null) {
    try {
        const { token } = await chrome.storage.local.get("token");
        if (!token) {
            return { success: false, error: "Not logged in. Open the Rightclicked popup to log in." };
        }
        const res = await fetch(`${API_BASE}/posts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(postData),
        });
        const raw = await res.text();
        const data = tryParseJson(raw);
        if (res.status === 429) {
            GlobalRateLimit.backoff(30);
            return { success: false, error: "Too many requests — please wait" };
        }
        if (!res.ok) {
            const msg = data?.error || data?.message || raw || "Save failed";
            throw new Error(typeof msg === "string" ? msg.slice(0, 220) : "Save failed");
        }
        const accountLabel = await getAccountLabel(token);

        // Non-blocking image pipeline: fire-and-forget so the "Saved" toast
        // is shown immediately without waiting for image processing.
        // Prefer routing through the content script (fetchImagesViaTab) which
        // shares the LinkedIn page's HTTP cache partition.  Fall back to a
        // direct service-worker fetch when no tabId is available.
        if (data?._id && Array.isArray(postData.imageUrls) && postData.imageUrls.length > 0) {
            const postId = String(data._id);
            if (tabId) {
                fetchImagesViaTab(tabId, postData.imageUrls, postId, token).catch(() => {});
            } else {
                handleImageRequest({ imageUrls: postData.imageUrls, postId }).catch(() => {});
            }
        }

        return { success: true, post: data || {}, accountLabel };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

function tryParseJson(raw) {
    if (!raw || typeof raw !== "string") return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function getAccountLabel(token) {
    try {
        const now = Date.now();
        if (AccountCache.token === token && AccountCache.label && now < AccountCache.expiresAt) {
            return AccountCache.label;
        }
        const res = await fetch(`${API_BASE}/auth/settings`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const label = data.email || data.name || null;
        if (label) {
            AccountCache.token = token;
            AccountCache.label = label;
            AccountCache.expiresAt = now + ACCOUNT_CACHE_TTL_MS;
        }
        return label;
    } catch {
        return null;
    }
}

async function updateEngagement(postUrl, engagement) {
    try {
        const { token } = await chrome.storage.local.get("token");
        if (!token || !postUrl) return { success: false };
        const res = await fetch(`${API_BASE}/posts/engagement-by-url`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ postUrl, engagement }),
        });
        if (!res.ok) return { success: false };
        return { success: true };
    } catch {
        return { success: false };
    }
}

async function getAuthStatus() {
    const { token } = await chrome.storage.local.get("token");
    return { authenticated: !!token };
}

function notifyTab(tabId, success, message) {
    chrome.tabs.sendMessage(tabId, { action: "showNotification", success, message }, () => {
        void chrome.runtime.lastError;
    });
}

// ── Image pipeline: content-script relay ─────────────────────
// Chrome partitions the HTTP cache by top-frame origin (Chrome 86+).
// Images on linkedin.com are cached under linkedin.com as top-frame.
// A service worker fetch uses chrome-extension:// as top-frame and
// therefore always misses the cache.  Sending the fetch request to
// the content script (which runs in the linkedin.com context) solves
// this: the content script's fetch() shares the page's cache partition.

/**
 * Asks the content script in `tabId` to fetch images from the browser
 * disk cache and relay the base64 data to the backend.
 * Falls back to handleImageRequest() (direct service-worker fetch)
 * if the tab is no longer available.
 */
async function fetchImagesViaTab(tabId, imageUrls, postId, token) {
    if (!tabId || !Array.isArray(imageUrls) || imageUrls.length === 0) {
        return { success: false };
    }
    try {
        const resp = await chrome.tabs.sendMessage(tabId, { action: "fetchImages", imageUrls });
        if (!resp?.images?.length) return { success: false };
        return relayToBackend(resp.images, postId, token);
    } catch {
        // Tab closed or navigated — fall back to a direct service-worker fetch.
        return handleImageRequest({ imageUrls, postId });
    }
}

// ── Image cache-fetch pipeline (service-worker fallback) ──────
// Used when no tabId is available (e.g. programmatic triggers).
// Because the service worker cache key differs from the page cache key,
// force-cache may result in a real network request to LinkedIn's CDN.
// This is acceptable as a last-resort fallback only.

/**
 * Validates that a base64 string is a complete, well-formed image
 * data-URI.  Prevents the backend from ingesting corrupted payloads.
 */
function validateImageIntegrity(base64String) {
    if (typeof base64String !== "string" || base64String.length < 50) return false;
    return (
        base64String.startsWith("data:image/jpeg;base64,") ||
        base64String.startsWith("data:image/png;base64,") ||
        base64String.startsWith("data:image/webp;base64,") ||
        base64String.startsWith("data:image/gif;base64,")
    );
}

/**
 * Reads a Blob and resolves with a base64 data-URI string.
 */
function processBlobAsBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("FileReader error"));
        reader.readAsDataURL(blob);
    });
}

/**
 * Fetches a single image URL using the browser's disk cache.
 *
 * cache: 'force-cache'  — browser returns a cached response without
 *                          re-validating with the server.
 * credentials: 'omit'   — no LinkedIn cookies are attached to the
 *                          request, preventing accidental session leaks.
 * mode: 'cors'          — service workers operate in a different origin
 *                          context and require explicit CORS mode.
 *
 * Returns a validated base64 data-URI string, or null on any failure.
 */
async function fetchFromCache(url) {
    try {
        const res = await fetch(url, {
            method: "GET",
            cache: "force-cache",
            credentials: "omit",
            mode: "cors",
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        if (!blob || blob.size === 0) return null;
        const base64 = await processBlobAsBase64(blob);
        return validateImageIntegrity(base64) ? base64 : null;
    } catch {
        return null;
    }
}

/**
 * Fetches a sequence of image URLs one at a time.
 *
 * Sequential (not parallel) fetching with a randomised delay between
 * requests (200-500 ms) prevents burst patterns that could be flagged
 * as automation by LinkedIn's detection systems.
 *
 * Returns an array of { url, alt, base64 } objects.
 * base64 is null for any URL that could not be retrieved from cache.
 */
async function fetchImageSequence(imageList) {
    const results = [];
    for (let i = 0; i < imageList.length; i++) {
        const { url, alt } = imageList[i];
        const base64 = await fetchFromCache(url);
        results.push({ url, alt: alt || "", base64: base64 || null });
        // Randomised delay between images to mimic human interaction timing.
        // Skip delay after the last image.
        if (i < imageList.length - 1) {
            const delay = 200 + Math.floor(Math.random() * 300);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    return results;
}

/**
 * Sends fetched image data to the backend to be persisted alongside
 * the saved post.  Only images that pass validateImageIntegrity are
 * included in the request body.
 */
async function relayToBackend(images, postId, token) {
    if (!images || images.length === 0 || !token || !postId) return { success: false };
    try {
        const valid = images.filter(img => img.base64 && validateImageIntegrity(img.base64));
        if (valid.length === 0) return { success: false, error: "No valid images after cache fetch" };
        const res = await fetch(`${API_BASE}/posts/${postId}/images`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ images: valid }),
        });
        if (!res.ok) return { success: false };
        return { success: true };
    } catch {
        return { success: false };
    }
}

/**
 * Orchestrates the full image-fetch pipeline for a single post.
 *
 * 1. Validates inputs.
 * 2. Applies a randomised initial latency (200-500 ms) so the first
 *    cache read does not occur at machine-perfect speed.
 * 3. Sequentially fetches each image URL from the browser cache.
 * 4. Relays validated base64 payloads to the backend.
 *
 * This function is called both internally by savePost() (fire-and-
 * forget) and directly via the fetchPostImages message action.
 */
async function handleImageRequest(msg) {
    const { imageUrls, postId } = msg;
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        return { success: false, error: "No image URLs provided" };
    }
    if (!postId) return { success: false, error: "No post ID provided" };

    const { token } = await chrome.storage.local.get("token");
    if (!token) return { success: false, error: "Not authenticated" };

    // Randomised initial latency so the fetch pipeline does not start
    // at the exact same millisecond as the post-save API call.
    const initialDelay = 200 + Math.floor(Math.random() * 300);
    await new Promise(r => setTimeout(r, initialDelay));

    const images = await fetchImageSequence(imageUrls);
    return relayToBackend(images, postId, token);
}

console.log("Rightclicked background service worker loaded");
