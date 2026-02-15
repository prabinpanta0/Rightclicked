import { useCallback, useEffect, useRef } from "react";

/**
 * Auto-refresh hook — silently refreshes data in the background.
 *
 * Triggers:
 *   1. Tab becomes visible again (user switches back)
 *   2. Periodic polling (default every 15s)
 *   3. Manual trigger via returned `refresh` function
 *
 * The refresh function is "lazy" — it never shows a loading spinner.
 * It's designed to be invisible to the user.
 *
 * @param {Function} refreshFn  — The silent refresh function to call
 * @param {Object}   opts
 * @param {number}   opts.interval — Polling interval in ms (default 15000)
 * @param {boolean}  opts.enabled  — Whether auto-refresh is active (default true)
 */
export default function useAutoRefresh(refreshFn, { interval = 15000, enabled = true } = {}) {
    const fnRef = useRef(refreshFn);
    fnRef.current = refreshFn;

    const refresh = useCallback(() => {
        fnRef.current?.();
    }, []);

    // Tab visibility — refresh when user comes back to the tab
    useEffect(() => {
        if (!enabled) return;
        function handleVisibility() {
            if (document.visibilityState === "visible") {
                fnRef.current?.();
            }
        }
        document.addEventListener("visibilitychange", handleVisibility);
        return () => document.removeEventListener("visibilitychange", handleVisibility);
    }, [enabled]);

    // Periodic polling
    useEffect(() => {
        if (!enabled || interval <= 0) return;
        const id = setInterval(() => {
            // Only poll when tab is visible to save resources
            if (document.visibilityState === "visible") {
                fnRef.current?.();
            }
        }, interval);
        return () => clearInterval(id);
    }, [enabled, interval]);

    // Window focus — refresh when user clicks back into the browser window
    useEffect(() => {
        if (!enabled) return;
        function handleFocus() {
            fnRef.current?.();
        }
        window.addEventListener("focus", handleFocus);
        return () => window.removeEventListener("focus", handleFocus);
    }, [enabled]);

    return refresh;
}
