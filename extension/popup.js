// Rightclicked popup — uses frontend login flow

const authSection = document.getElementById("auth-section");
const loggedInSection = document.getElementById("logged-in-section");
const authError = document.getElementById("auth-error");
const loginViaFrontend = document.getElementById("login-via-frontend");
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

// Login via frontend — opens the Rightclicked web app login page.
// We wait for the background to confirm it opened the tab before closing
// the popup, otherwise window.close() kills the context mid-message.
loginViaFrontend.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "openFrontendLogin" }, () => {
        window.close();
    });
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

        // Ask the content script to extract the post (single source of truth)
        chrome.tabs.sendMessage(tab.id, { action: "extractPost" }, resp => {
            if (chrome.runtime.lastError || !resp?.postData) {
                showPreviewEmpty("No post found. Use Save buttons in the LinkedIn feed.");
                return;
            }
            const data = resp.postData;
            if (data && data.postText) {
                extractedPostData = data;
                previewAuthor.textContent = data.authorName || "Unknown Author";
                previewText.textContent =
                    data.postText.length > 150 ? data.postText.slice(0, 150) + "..." : data.postText;
                previewLoading.style.display = "none";
                previewContent.style.display = "block";
            } else {
                showPreviewEmpty("No post found. Use Save buttons in the LinkedIn feed.");
            }
        });
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
            saveFromPopup.textContent = "Save This Post";
            saveFromPopup.classList.remove("failed");
            saveFromPopup.disabled = false;
        }, 3000);
    }
});

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
