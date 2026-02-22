import { create } from "zustand";
import {
    aiSearchPosts as apiAiSearchPosts,
    analyzePost as apiAnalyzePost,
    batchAnalyze as apiBatchAnalyze,
    deletePost as apiDeletePost,
    formatPost as apiFormatPost,
    getGroupedPosts as apiGetGroupedPosts,
    getPosts as apiGetPosts,
    searchPosts as apiSearchPosts,
    updatePostTags as apiUpdatePostTags,
    trackEvent,
} from "../api";

export const usePostStore = create((set, get) => ({
    posts: [],
    total: 0,
    page: 1,
    totalPages: 1,
    groups: [],
    groupBy: null,
    loading: false,
    error: null,
    aiTerms: [],
    aiTopics: [],
    /** Incremented on every data change — consumers can react to this */
    _rev: 0,

    fetchPosts: async (page = 1) => {
        set({ loading: true, error: null });
        try {
            const { data } = await apiGetPosts(page);
            set({
                posts: data.posts,
                total: data.total,
                page: data.page,
                totalPages: data.totalPages,
                loading: false,
                _rev: get()._rev + 1,
            });
        } catch (err) {
            set({ error: "Failed to load posts", loading: false });
        }
    },

    /** Re-fetch the current page silently (no loading spinner). */
    silentRefresh: async () => {
        try {
            const currentPage = get().page || 1;
            const { data } = await apiGetPosts(currentPage);
            // Only update if something actually changed
            const prev = get();
            const changed =
                data.total !== prev.total ||
                data.posts.length !== prev.posts.length ||
                JSON.stringify(data.posts.map(p => p._id + (p.summary || "") + (p.sentiment || ""))) !==
                    JSON.stringify(prev.posts.map(p => p._id + (p.summary || "") + (p.sentiment || "")));
            if (changed) {
                set({
                    posts: data.posts,
                    total: data.total,
                    page: data.page,
                    totalPages: data.totalPages,
                    _rev: prev._rev + 1,
                });
            }
        } catch (_) {
            // Silent — don't show errors for background refreshes
        }
    },

    /** Re-fetch grouped data silently. */
    silentRefreshGrouped: async () => {
        const groupBy = get().groupBy;
        if (!groupBy) return;
        try {
            const { data } = await apiGetGroupedPosts(groupBy);
            set({ groups: data.groups, _rev: get()._rev + 1 });
        } catch (_) {}
    },

    searchPosts: async params => {
        set({ loading: true, error: null, aiTerms: [], aiTopics: [] });
        try {
            trackEvent("search", { query: params.q }).catch(() => {});
            const { data } = await apiSearchPosts(params);
            set({
                posts: data.posts,
                total: data.total,
                page: data.page,
                totalPages: data.totalPages,
                loading: false,
            });
        } catch (err) {
            set({ error: "Search failed", loading: false });
        }
    },

    aiSearch: async query => {
        set({ loading: true, error: null, aiTerms: [], aiTopics: [] });
        try {
            trackEvent("ai_search", { query }).catch(() => {});
            const { data } = await apiAiSearchPosts({ q: query });
            set({
                posts: data.posts,
                total: data.total,
                page: data.page,
                totalPages: data.totalPages,
                aiTerms: data.aiTerms || [],
                aiTopics: data.aiTopics || [],
                loading: false,
            });
        } catch (err) {
            set({ error: "AI search failed", loading: false });
        }
    },

    fetchGrouped: async groupBy => {
        set({ loading: true, error: null, groupBy });
        try {
            const { data } = await apiGetGroupedPosts(groupBy);
            set({ groups: data.groups, loading: false });
        } catch (err) {
            set({ error: "Failed to load groups", loading: false });
        }
    },

    removePost: async id => {
        try {
            await apiDeletePost(id);
            const newPosts = get().posts.filter(p => p._id !== id);
            const newTotal = Math.max(0, get().total - 1);
            set({
                posts: newPosts,
                total: newTotal,
                totalPages: Math.max(1, Math.ceil(newTotal / 20)),
            });
        } catch (err) {
            set({ error: "Failed to delete post" });
        }
    },

    updateTags: async (id, tags) => {
        try {
            const { data } = await apiUpdatePostTags(id, tags);
            set({
                posts: get().posts.map(p => (p._id === id ? data : p)),
            });
        } catch (err) {
            set({ error: "Failed to update tags" });
        }
    },

    reanalyze: async id => {
        try {
            const { data } = await apiAnalyzePost(id);
            set({
                posts: get().posts.map(p => (p._id === id ? data : p)),
            });
            return data;
        } catch (err) {
            const errMsg = err.response?.data?.error || "Analysis failed";
            set({ error: errMsg });
            return null;
        }
    },

    formatPost: async id => {
        try {
            const { data } = await apiFormatPost(id);
            set({
                posts: get().posts.map(p => (p._id === id ? data : p)),
            });
            return data;
        } catch (err) {
            const errMsg = err.response?.data?.error || "Formatting failed";
            set({ error: errMsg });
            return null;
        }
    },

    batchAnalyze: async () => {
        try {
            const { data } = await apiBatchAnalyze();
            return data;
        } catch (err) {
            set({ error: "Batch analysis failed" });
            return null;
        }
    },

    clearError: () => set({ error: null }),
}));
