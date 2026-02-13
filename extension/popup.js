// Rightclicked popup

// reCAPTCHA site key — replace with your actual key, or leave empty to skip in dev
const RECAPTCHA_SITE_KEY = "";

let recaptchaLoaded = false;
function loadRecaptcha() {
    if (recaptchaLoaded || !RECAPTCHA_SITE_KEY) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
        s.async = true;
        s.onload = () => {
            recaptchaLoaded = true;
            resolve();
        };
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

async function getRecaptchaToken(action) {
    if (!RECAPTCHA_SITE_KEY) return null;
    await loadRecaptcha();
    return new Promise(resolve => {
        window.grecaptcha.ready(() => {
            window.grecaptcha.execute(RECAPTCHA_SITE_KEY, { action }).then(resolve);
        });
    });
}

const authSection = document.getElementById("auth-section");
const loggedInSection = document.getElementById("logged-in-section");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const authError = document.getElementById("auth-error");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const previewLoading = document.getElementById("preview-loading");
const previewContent = document.getElementById("preview-content");
const previewEmpty = document.getElementById("preview-empty");
const previewAuthor = document.getElementById("preview-author");
const previewText = document.getElementById("preview-text");
const saveFromPopup = document.getElementById("save-from-popup");
const saveResult = document.getElementById("save-result");
const logoutLink = document.getElementById("logout-link");
const mainTabSave = document.getElementById("main-tab-save");
const mainTabRecent = document.getElementById("main-tab-recent");
const saveTabContent = document.getElementById("save-tab-content");
const recentTabContent = document.getElementById("recent-tab-content");
const recentList = document.getElementById("recent-list");

let extractedPostData = null;

// ---------- Auth tab switching ----------

tabLogin.addEventListener("click", () => {
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    loginForm.style.display = "flex";
    registerForm.style.display = "none";
    authError.textContent = "";
});

tabRegister.addEventListener("click", () => {
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    registerForm.style.display = "flex";
    loginForm.style.display = "none";
    authError.textContent = "";
});

// ---------- Auth ----------

async function checkAuth() {
    const { token } = await chrome.storage.local.get("token");
    if (token) {
        authSection.style.display = "none";
        loggedInSection.style.display = "block";
        extractCurrentPost();
    } else {
        authSection.style.display = "block";
        loggedInSection.style.display = "none";
    }
}

loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    authError.textContent = "";
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const btn = document.getElementById("login-btn");
    btn.disabled = true;
    btn.textContent = "Logging in...";

    const recaptchaToken = await getRecaptchaToken("login");
    const result = await chrome.runtime.sendMessage({ action: "login", email, password, recaptchaToken });
    if (result.success) {
        checkAuth();
    } else {
        authError.textContent = result.error || "Login failed";
    }
    btn.disabled = false;
    btn.textContent = "Log In";
});

registerForm.addEventListener("submit", async e => {
    e.preventDefault();
    authError.textContent = "";
    const name = document.getElementById("reg-name").value;
    const email = document.getElementById("reg-email").value;
    const password = document.getElementById("reg-password").value;
    const btn = document.getElementById("register-btn");
    btn.disabled = true;
    btn.textContent = "Registering...";

    const recaptchaToken = await getRecaptchaToken("register");
    const result = await chrome.runtime.sendMessage({ action: "register", name, email, password, recaptchaToken });
    if (result.success) {
        checkAuth();
    } else {
        authError.textContent = result.error || "Registration failed";
    }
    btn.disabled = false;
    btn.textContent = "Register";
});

logoutLink.addEventListener("click", async e => {
    e.preventDefault();
    await chrome.storage.local.remove("token");
    checkAuth();
});

// ---------- Post extraction from active tab ----------

async function extractCurrentPost() {
    previewLoading.style.display = "block";
    previewContent.style.display = "none";
    previewEmpty.style.display = "none";
    saveResult.className = "save-result";

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !tab.url.includes("linkedin.com")) {
            showPreviewEmpty("Not on LinkedIn. Navigate to LinkedIn to save posts.");
            return;
        }

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: extractPostFromPage,
        });

        const data = results?.[0]?.result;
        if (data && data.postText) {
            extractedPostData = data;
            previewAuthor.textContent = data.authorName || "Unknown Author";
            previewText.textContent = data.postText.length > 150 ? data.postText.slice(0, 150) + "..." : data.postText;
            previewLoading.style.display = "none";
            previewContent.style.display = "block";
        } else {
            showPreviewEmpty("No post found. Use Save buttons in the LinkedIn feed.");
        }
    } catch (err) {
        showPreviewEmpty("Cannot read this page. Try reloading LinkedIn.");
    }
}

function showPreviewEmpty(msg) {
    previewLoading.style.display = "none";
    previewContent.style.display = "none";
    previewEmpty.style.display = "block";
    previewEmpty.textContent = msg;
}

// ---------- Save from popup ----------

saveFromPopup.addEventListener("click", async () => {
    if (!extractedPostData) return;
    saveFromPopup.disabled = true;
    saveFromPopup.textContent = "Saving...";
    const startTime = Date.now();
    popupTrackEvent("save_attempt");

    const result = await chrome.runtime.sendMessage({ action: "savePost", postData: extractedPostData });
    const timeMs = Date.now() - startTime;
    if (result.success) {
        popupTrackEvent("save_success", { timeMs });
        saveFromPopup.textContent = "Saved!";
        saveFromPopup.classList.add("saved");
        saveResult.textContent = `Post by ${extractedPostData.authorName} saved successfully`;
        saveResult.className = "save-result ok";
    } else {
        popupTrackEvent("save_failure", { timeMs, reason: result.error });
        saveFromPopup.textContent = "Save Failed";
        saveFromPopup.classList.add("failed");
        saveResult.textContent = result.error || "Save failed";
        saveResult.className = "save-result err";
        setTimeout(() => {
            saveFromPopup.textContent = "Save to Rightclicked";
            saveFromPopup.classList.remove("failed");
            saveFromPopup.disabled = false;
        }, 3000);
    }
});

// Extraction function -- serialized and injected into the LinkedIn page via chrome.scripting
function extractPostFromPage() {
    const selectors = [
        '[data-urn*="urn:li:activity"]',
        '[data-urn*="urn:li:ugcPost"]',
        '[data-urn*="urn:li:share"]',
        ".feed-shared-update-v2",
        ".occludable-update",
    ];

    // Collect ALL post containers, then pick the most visible one
    const seen = new Set();
    const containers = [];
    for (const sel of selectors) {
        try {
            document.querySelectorAll(sel).forEach(el => {
                if (!seen.has(el)) {
                    seen.add(el);
                    containers.push(el);
                }
            });
        } catch (_) {}
    }

    // Pick the container most visible in the viewport
    let container = null;
    if (containers.length > 1) {
        let bestScore = -1;
        for (const c of containers) {
            const rect = c.getBoundingClientRect();
            const vTop = Math.max(0, rect.top);
            const vBot = Math.min(window.innerHeight, rect.bottom);
            const visible = Math.max(0, vBot - vTop);
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

    // Strategy 1: actor/header section within the container
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

    // Strategy 2: first non-comment profile link in container
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

    // Strategy 3: look at our own injected Save button text ("Save · AuthorName")
    if (!authorName) {
        const saveBtn = container.querySelector(".rc-save-btn");
        if (saveBtn) {
            const match = saveBtn.textContent.match(/(?:Save|Saved)\s*[·]\s*(.+)/i);
            if (match && match[1]) {
                authorName = match[1].trim();
            }
        }
    }

    // Strategy 4: extract from URL on single post pages (linkedin.com/posts/firstname-lastname-...)
    if (!authorName) {
        const urlMatch = window.location.pathname.match(/\/posts\/([\w-]+?)_/);
        if (urlMatch) {
            authorName = urlMatch[1].replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        }
    }

    if (!authorName) authorName = "Unknown Author";

    let postText = "";
    const textSels =
        '[class*="break-words"], [class*="commentary"], span[dir="ltr"], [class*="feed-shared-text"], [class*="update-components-text"]';
    for (const el of container.querySelectorAll(textSels)) {
        if (isInsideComment(el, container)) continue;
        const t = el.innerText.trim();
        if (t.length > postText.length) postText = t;
    }
    if (!postText) {
        for (const el of container.querySelectorAll("div, p, span")) {
            if (isInsideComment(el, container)) continue;
            const t = el.innerText.trim();
            if (t.length > 60 && t.length > postText.length) postText = t;
        }
    }

    // Helper: check if an element is inside a comment section
    function isInsideComment(el, root) {
        let cur = el;
        while (cur && cur !== root) {
            const cls = typeof cur.className === "string" ? cur.className : "";
            if (
                cls.includes("comments-comment") ||
                cls.includes("comment-item") ||
                cls.includes("social-details-social-activity")
            )
                return true;
            cur = cur.parentElement;
        }
        return false;
    }

    let timestamp = "";
    const timeEl = container.querySelector("time");
    if (timeEl) timestamp = timeEl.getAttribute("datetime") || timeEl.innerText.trim();

    // Engagement — scan all text/aria-labels for patterns like "379 reactions", "22 comments"
    let likes = 0,
        comments = 0,
        reposts = 0;
    function parseNum(str) {
        if (!str) return 0;
        const s = str.replace(/,/g, "").trim();
        const km = s.match(/(\d+(?:\.\d+)?)\s*([KkMm])/);
        if (km) return Math.round(parseFloat(km[1]) * (km[2].toLowerCase() === "k" ? 1000 : 1000000));
        const d = s.match(/\d+/);
        return d ? parseInt(d[0], 10) : 0;
    }
    const engRe = /(\d[\d,.]*\s*[KkMm]?)\s*(reaction|like|comment|repost|share)s?/i;
    const socialArea =
        container.querySelector('[class*="social-details"]') ||
        container.querySelector('[class*="social-counts"]') ||
        container;
    const texts = new Set();
    socialArea.querySelectorAll("[aria-label]").forEach(el => texts.add(el.getAttribute("aria-label")));
    socialArea.querySelectorAll("button, span, a, div").forEach(el => {
        if (el.children.length <= 2 && el.innerText?.length < 200) texts.add(el.innerText.trim());
    });
    container
        .querySelectorAll("button[aria-label], span[aria-label]")
        .forEach(el => texts.add(el.getAttribute("aria-label")));
    for (const t of texts) {
        if (!t) continue;
        const m = t.match(engRe);
        if (!m) continue;
        const count = parseNum(m[1]);
        const word = m[2];
        if (!count) continue;
        if (/reaction|like/i.test(word) && count > likes) likes = count;
        else if (/comment/i.test(word) && count > comments) comments = count;
        else if (/repost|share/i.test(word) && count > reposts) reposts = count;
    }
    const engagement = { likes, comments, reposts };

    let postUrl = window.location.href;
    const urnEl = container.closest("[data-urn]") || container.querySelector("[data-urn]");
    if (urnEl) {
        const urn = urnEl.getAttribute("data-urn");
        const id = urn.split(":").pop();
        if (urn.includes("activity")) postUrl = "https://www.linkedin.com/feed/update/urn:li:activity:" + id + "/";
        else if (urn.includes("ugcPost")) postUrl = "https://www.linkedin.com/feed/update/urn:li:ugcPost:" + id + "/";
    }

    return { authorName, authorUrl, postText, postUrl, timestamp, engagement, dateSaved: new Date().toISOString() };
}

// ---------- Main tabs (Save / Recent) ----------

mainTabSave.addEventListener("click", () => {
    mainTabSave.classList.add("active");
    mainTabRecent.classList.remove("active");
    saveTabContent.style.display = "block";
    recentTabContent.style.display = "none";
});

mainTabRecent.addEventListener("click", () => {
    mainTabRecent.classList.add("active");
    mainTabSave.classList.remove("active");
    recentTabContent.style.display = "block";
    saveTabContent.style.display = "none";
    loadRecentSaves();
});

async function loadRecentSaves() {
    recentList.innerHTML = '<div class="preview-loading">Loading...</div>';
    try {
        const { token } = await chrome.storage.local.get("token");
        if (!token) return;
        const res = await fetch("http://localhost:3001/api/posts?limit=5&sort=-dateSaved", {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        const posts = data.posts || [];
        if (posts.length === 0) {
            recentList.innerHTML = '<div class="recent-empty">No saved posts yet</div>';
            return;
        }
        recentList.innerHTML = "";
        for (const p of posts) {
            const item = document.createElement("div");
            item.className = "recent-item";
            const left = document.createElement("div");
            const author = document.createElement("div");
            author.className = "recent-author";
            author.textContent = p.authorName || "Unknown";
            const text = document.createElement("div");
            text.className = "recent-text";
            text.textContent = p.postText ? p.postText.slice(0, 60) : "";
            left.appendChild(author);
            left.appendChild(text);
            const time = document.createElement("div");
            time.className = "recent-time";
            time.textContent = timeAgo(p.dateSaved);
            item.appendChild(left);
            item.appendChild(time);
            recentList.appendChild(item);
        }
    } catch {
        recentList.innerHTML = '<div class="recent-empty">Could not load recent saves</div>';
    }
}

function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    const days = Math.floor(hrs / 24);
    return days + "d ago";
}

async function popupTrackEvent(event, meta) {
    const { token } = await chrome.storage.local.get("token");
    if (!token) return;
    fetch("http://localhost:3001/api/analytics/event", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ event, meta: meta || {} }),
    }).catch(() => {});
}

checkAuth();
