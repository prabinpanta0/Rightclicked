const API_BASE = "http://localhost:3001/api";
const FRONTEND_BASE = "http://localhost:5173";

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

    chrome.tabs.sendMessage(tab.id, { action: "extractPost" }, async resp => {
        if (chrome.runtime.lastError || !resp?.postData) {
            notifyTab(tab.id, false, "Could not find post content here.");
            return;
        }
        const result = await savePost(resp.postData);
        notifyTab(tab.id, result.success, result.success ? `Saved post by ${resp.postData.authorName}` : result.error);
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
        savePost(msg.postData).then(sendResponse);
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

async function savePost(postData) {
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
        const data = await res.json();
        if (res.status === 429) {
            GlobalRateLimit.backoff(30);
            return { success: false, error: "Too many requests — please wait" };
        }
        if (!res.ok) throw new Error(data.error || "Save failed");
        return { success: true, post: data };
    } catch (err) {
        return { success: false, error: err.message };
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

console.log("Rightclicked background service worker loaded");
