import { create } from "zustand";
import {
    aiSearchPosts as apiAiSearchPosts,
    analyzePost as apiAnalyzePost,
    batchAnalyze as apiBatchAnalyze,
    deletePost as apiDeletePost,
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
            });
        } catch (err) {
            set({ error: "Failed to load posts", loading: false });
        }
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
            set({ posts: get().posts.filter(p => p._id !== id) });
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
        } catch (err) {
            set({ error: "Analysis failed" });
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
