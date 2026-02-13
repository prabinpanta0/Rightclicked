const API_BASE = "http://localhost:3001/api";

// ---------- Context menu ----------

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "save-to-rightclicked",
        title: "Save to Rightclicked",
        contexts: ["all"],
        documentUrlPatterns: ["https://www.linkedin.com/*"],
    });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== "save-to-rightclicked") return;
    try {
        // Try content script first
        let postData = await tryContentScriptExtract(tab.id);
        // Fallback: programmatic extraction via chrome.scripting
        if (!postData) {
            postData = await scriptingExtract(tab.id);
        }
        if (!postData || !postData.postText) {
            notifyTab(tab.id, false, "No LinkedIn post content found");
            return;
        }
        const result = await savePost(postData);
        notifyTab(tab.id, result.success, result.success ? `Saved post by ${postData.authorName}` : result.error);
    } catch (err) {
        notifyTab(tab.id, false, "Save failed: " + (err.message || "unknown error"));
    }
});

// ---------- Message listener ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "savePost") {
        savePost(msg.postData).then(sendResponse);
        return true;
    }
    if (msg.action === "getStatus") {
        getAuthStatus().then(sendResponse);
        return true;
    }
    if (msg.action === "login") {
        loginUser(msg.email, msg.password, msg.recaptchaToken).then(sendResponse);
        return true;
    }
    if (msg.action === "register") {
        registerUser(msg.name, msg.email, msg.password, msg.recaptchaToken).then(sendResponse);
        return true;
    }
    if (msg.action === "updateEngagement") {
        updateEngagement(msg.postUrl, msg.engagement).then(sendResponse);
        return true;
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

async function loginUser(email, password, recaptchaToken) {
    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, recaptchaToken }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Login failed");
        await chrome.storage.local.set({ token: data.token });
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function registerUser(name, email, password, recaptchaToken) {
    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password, recaptchaToken }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Registration failed");
        await chrome.storage.local.set({ token: data.token });
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function getAuthStatus() {
    const { token } = await chrome.storage.local.get("token");
    return { authenticated: !!token };
}

// ---------- Extraction helpers ----------

function tryContentScriptExtract(tabId) {
    return new Promise(resolve => {
        chrome.tabs.sendMessage(tabId, { action: "extractPost" }, resp => {
            if (chrome.runtime.lastError || !resp?.postData) {
                resolve(null);
            } else {
                resolve(resp.postData);
            }
        });
    });
}

async function scriptingExtract(tabId) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: extractFromDOM,
        });
        return results?.[0]?.result || null;
    } catch {
        return null;
    }
}

function notifyTab(tabId, success, message) {
    chrome.tabs.sendMessage(tabId, { action: "showNotification", success, message }, () => {
        void chrome.runtime.lastError; // suppress error if content script absent
    });
}

// This function is serialized and injected into the page via chrome.scripting
function extractFromDOM() {
    // Collect all post containers and pick the most visible one
    const postSels = [
        '[data-urn*="urn:li:activity"]',
        '[data-urn*="urn:li:ugcPost"]',
        '[data-urn*="urn:li:share"]',
        ".feed-shared-update-v2",
        ".occludable-update",
    ];
    const seen = new Set();
    const containers = [];
    for (const sel of postSels) {
        try {
            document.querySelectorAll(sel).forEach(el => {
                if (!seen.has(el)) {
                    seen.add(el);
                    containers.push(el);
                }
            });
        } catch (_) {}
    }

    let container = null;
    if (containers.length > 1) {
        let bestScore = -1;
        for (const c of containers) {
            const rect = c.getBoundingClientRect();
            const visible = Math.max(0, Math.min(window.innerHeight, rect.bottom) - Math.max(0, rect.top));
            if (visible > bestScore) {
                bestScore = visible;
                container = c;
            }
        }
    } else {
        container = containers[0] || document.body;
    }

    let authorName = "",
        authorUrl = "";

    // Strategy 1: actor/header section
    const actorSels = [
        '[class*="feed-shared-actor"]',
        '[class*="update-components-actor"]',
        '[class*="feed-shared-header"]',
        '[class*="update-components-header"]',
    ];
    for (const sel of actorSels) {
        const actor = container.querySelector(sel);
        if (!actor) continue;
        for (const a of actor.querySelectorAll('a[href*="/in/"], a[href*="/company/"]')) {
            const t = a.innerText.trim().split("\n")[0].trim();
            if (t.length > 0 && t.length < 120) {
                authorName = t;
                authorUrl = a.href;
                break;
            }
        }
        if (authorName) break;
    }

    // Strategy 2: first non-comment profile link
    if (!authorName) {
        for (const a of container.querySelectorAll('a[href*="/in/"], a[href*="/company/"]')) {
            let inComment = false;
            let p = a;
            while (p && p !== container) {
                const cls = typeof p.className === "string" ? p.className : "";
                if (
                    cls.includes("comments-comment") ||
                    cls.includes("comment-item") ||
                    cls.includes("social-details-social-activity")
                ) {
                    inComment = true;
                    break;
                }
                p = p.parentElement;
            }
            if (inComment) continue;
            const t = a.innerText.trim().split("\n")[0].trim();
            if (t.length > 0 && t.length < 120) {
                authorName = t;
                authorUrl = a.href;
                break;
            }
        }
    }

    // Strategy 3: look at injected Save button ("Save · AuthorName")
    if (!authorName) {
        const saveBtn = container.querySelector(".rc-save-btn");
        if (saveBtn) {
            const match = saveBtn.textContent.match(/(?:Save|Saved)\s*[·]\s*(.+)/i);
            if (match && match[1]) authorName = match[1].trim();
        }
    }

    // Strategy 4: extract from URL on single post pages
    if (!authorName) {
        const urlMatch = window.location.pathname.match(/\/posts\/([\w-]+?)_/);
        if (urlMatch) {
            authorName = urlMatch[1].replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        }
    }

    if (!authorName) authorName = "Unknown Author";

    let postText = "";
    const sels =
        '[class*="break-words"], [class*="commentary"], span[dir="ltr"], [class*="feed-shared-text"], [class*="update-components-text"]';
    for (const el of container.querySelectorAll(sels)) {
        const t = el.innerText.trim();
        if (t.length > postText.length) postText = t;
    }
    if (!postText) {
        for (const el of container.querySelectorAll("div, p, span")) {
            const t = el.innerText.trim();
            if (t.length > 60 && t.length > postText.length) postText = t;
        }
    }

    let timestamp = "";
    const timeEl = container.querySelector("time");
    if (timeEl) timestamp = timeEl.getAttribute("datetime") || timeEl.innerText.trim();

    let postUrl = window.location.href;
    const urnEl =
        container.closest("[data-urn]") || container.querySelector('[data-urn*="activity"], [data-urn*="ugcPost"]');
    if (urnEl) {
        const urn = urnEl.getAttribute("data-urn");
        const id = urn.split(":").pop();
        if (urn.includes("activity")) postUrl = "https://www.linkedin.com/feed/update/urn:li:activity:" + id + "/";
        else if (urn.includes("ugcPost")) postUrl = "https://www.linkedin.com/feed/update/urn:li:ugcPost:" + id + "/";
    }

    return { authorName, authorUrl, postText, postUrl, timestamp, dateSaved: new Date().toISOString() };
}
