import { create } from "zustand";
import { login as apiLogin, register as apiRegister, trackEvent } from "../api";
import { getRecaptchaToken } from "../api/recaptcha";

// Session heartbeat — fires every 5 minutes while app is open
let heartbeatInterval = null;
function startHeartbeat() {
    stopHeartbeat();
    trackEvent("session_start").catch(() => {});
    heartbeatInterval = setInterval(
        () => {
            trackEvent("session_heartbeat").catch(() => {});
        },
        5 * 60 * 1000,
    );
}
function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

export const useAuthStore = create(set => ({
    token: localStorage.getItem("rc-token") || null,
    user: null,
    loading: false,
    error: null,

    login: async (email, password) => {
        set({ loading: true, error: null });
        try {
            const recaptchaToken = await getRecaptchaToken("login");
            const { data } = await apiLogin(email, password, recaptchaToken);
            localStorage.setItem("rc-token", data.token);
            startHeartbeat();
            set({ token: data.token, user: data.user, loading: false });
        } catch (err) {
            set({ error: err.response?.data?.error || "Login failed", loading: false });
            throw err;
        }
    },

    register: async (email, password, name) => {
        set({ loading: true, error: null });
        try {
            const recaptchaToken = await getRecaptchaToken("register");
            const { data } = await apiRegister(email, password, name, recaptchaToken);
            localStorage.setItem("rc-token", data.token);
            startHeartbeat();
            set({ token: data.token, user: data.user, loading: false });
        } catch (err) {
            set({ error: err.response?.data?.error || "Registration failed", loading: false });
            throw err;
        }
    },

    logout: () => {
        localStorage.removeItem("rc-token");
        stopHeartbeat();
        set({ token: null, user: null });
    },

    clearError: () => set({ error: null }),
}));
