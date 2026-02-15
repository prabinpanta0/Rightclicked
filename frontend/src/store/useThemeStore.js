import { create } from "zustand";

function applyTheme(theme) {
    document.documentElement.classList.toggle("dark", theme === "dark");
}

export const useThemeStore = create((set, get) => {
    const saved = localStorage.getItem("rc-theme") || "light";

    // Apply immediately on store creation
    applyTheme(saved);

    return {
        preference: saved, // "light" | "dark"

        setTheme(pref) {
            localStorage.setItem("rc-theme", pref);
            applyTheme(pref);
            set({ preference: pref });
        },

        /** Toggle between light and dark */
        cycleTheme() {
            const next = get().preference === "light" ? "dark" : "light";
            get().setTheme(next);
        },
    };
});
