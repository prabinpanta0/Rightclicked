import axios from "axios";

// In production, VITE_API_URL points to the Vercel-hosted backend.
// In development, the Vite proxy handles /api → localhost:3001.
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "/api",
    headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(config => {
    const token = localStorage.getItem("rc-token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    res => res,
    err => {
        if (err.response?.status === 401) {
            localStorage.removeItem("rc-token");
            window.location.href = "/login";
        }
        return Promise.reject(err);
    },
);

// Auth
export const login = (email, password, recaptchaToken) => api.post("/auth/login", { email, password, recaptchaToken });

export const register = (email, password, name, recaptchaToken) =>
    api.post("/auth/register", { email, password, name, recaptchaToken });

// Posts
export const getPosts = (page = 1, limit = 20) => api.get("/posts", { params: { page, limit } });

export const searchPosts = params => api.get("/posts/search", { params });

export const aiSearchPosts = params => api.get("/posts/search/ai", { params });

export const getGroupedPosts = groupBy => api.get(`/posts/group/${groupBy}`);

export const updatePostTags = (id, tags) => api.patch(`/posts/${id}/tags`, { tags });

export const deletePost = id => api.delete(`/posts/${id}`);

export const analyzePost = id => api.post(`/posts/${id}/analyze`);

// Batch analyze
export const batchAnalyze = () => api.post("/posts/analyze-batch");

// Analytics
export const trackEvent = (event, meta) => api.post("/analytics/event", { event, meta });

export const getAnalyticsDashboard = () => api.get("/analytics/dashboard");

// Settings
export const getSettings = () => api.get("/auth/settings");

export const updateSettings = settings => api.patch("/auth/settings", settings);

export default api;
