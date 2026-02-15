import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import { useThemeStore } from "../store/useThemeStore";

const THEME_ICONS = {
    light: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zm0 13a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zm-8-5a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 012 10zm13 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 0115 10zM4.343 4.343a.75.75 0 011.06 0l1.061 1.06a.75.75 0 01-1.06 1.061l-1.061-1.06a.75.75 0 010-1.06zm9.193 9.193a.75.75 0 011.06 0l1.061 1.06a.75.75 0 01-1.06 1.061l-1.061-1.06a.75.75 0 010-1.061zM4.343 15.657a.75.75 0 010-1.06l1.06-1.061a.75.75 0 111.061 1.06l-1.06 1.061a.75.75 0 01-1.06 0zm9.193-9.193a.75.75 0 010-1.061l1.06-1.06a.75.75 0 111.061 1.06l-1.06 1.06a.75.75 0 01-1.061 0zM10 7a3 3 0 100 6 3 3 0 000-6z" />
        </svg>
    ),
    dark: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
                fillRule="evenodd"
                d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 118.24 1.737a.75.75 0 01.77.267z"
                clipRule="evenodd"
            />
        </svg>
    ),
};

const FILTER_LINKS = [
    { to: "/groups/author", label: "By Author" },
    { to: "/groups/topic", label: "By Topic" },
    { to: "/groups/date", label: "By Date" },
    { to: "/groups/tags", label: "By Tags" },
    { to: "/groups/sentiment", label: "By Sentiment" },
    { to: "/groups/engagement", label: "By Engagement" },
];

export default function Navbar() {
    const location = useLocation();
    const navigate = useNavigate();
    const logout = useAuthStore(s => s.logout);
    const { preference, cycleTheme } = useThemeStore();
    const [filterOpen, setFilterOpen] = useState(false);
    const filterRef = useRef(null);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e) {
            if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false);
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    // Cmd/Ctrl + K global search shortcut
    useEffect(() => {
        function handleKey(e) {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                navigate("/search");
            }
        }
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [navigate]);

    const isActive = to => location.pathname === to;
    const isFilterActive = FILTER_LINKS.some(l => isActive(l.to));

    const navLink = (to, label) => (
        <Link
            key={to}
            to={to}
            className={`px-3 py-1.5 text-[13px] rounded-md transition-colors ${
                isActive(to)
                    ? "bg-accent text-linkedin font-semibold"
                    : "text-muted hover:bg-surface-hover hover:text-body"
            }`}
        >
            {label}
        </Link>
    );

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-surface border-b border-border backdrop-blur-sm bg-opacity-90 transition-colors">
            <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
                {/* Brand */}
                <Link to="/" className="text-lg font-bold text-linkedin tracking-tight">
                    Rightclicked
                </Link>

                {/* Nav items */}
                <div className="flex items-center gap-1">
                    {navLink("/", "Dashboard")}

                    {/* Filter dropdown */}
                    <div ref={filterRef} className="relative">
                        <button
                            onClick={() => setFilterOpen(!filterOpen)}
                            className={`px-3 py-1.5 text-[13px] rounded-md transition-colors inline-flex items-center gap-1 ${
                                isFilterActive
                                    ? "bg-accent text-linkedin font-semibold"
                                    : "text-muted hover:bg-surface-hover hover:text-body"
                            }`}
                        >
                            Browse
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 16 16"
                                fill="currentColor"
                                className={`w-3 h-3 transition-transform ${filterOpen ? "rotate-180" : ""}`}
                            >
                                <path
                                    fillRule="evenodd"
                                    d="M4.22 6.22a.75.75 0 011.06 0L8 8.94l2.72-2.72a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L4.22 7.28a.75.75 0 010-1.06z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </button>

                        {filterOpen && (
                            <div className="absolute top-full left-0 mt-1 w-48 py-1 bg-surface border border-border rounded-lg shadow-lg z-50">
                                {FILTER_LINKS.map(({ to, label }) => (
                                    <Link
                                        key={to}
                                        to={to}
                                        onClick={() => setFilterOpen(false)}
                                        className={`block px-4 py-2 text-sm transition-colors ${
                                            isActive(to)
                                                ? "bg-accent text-linkedin font-medium"
                                                : "text-body hover:bg-surface-hover"
                                        }`}
                                    >
                                        {label}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Search — prominent with keyboard shortcut */}
                    <Link
                        to="/search"
                        className={`px-3 py-1.5 text-[13px] rounded-md transition-colors inline-flex items-center gap-1.5 ${
                            isActive("/search")
                                ? "bg-accent text-linkedin font-semibold"
                                : "text-muted hover:bg-surface-hover hover:text-body"
                        }`}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            className="w-3.5 h-3.5"
                        >
                            <path
                                fillRule="evenodd"
                                d="M9.965 11.026a5 5 0 111.06-1.06l2.755 2.754a.75.75 0 11-1.06 1.06l-2.755-2.754zM10.5 7a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z"
                                clipRule="evenodd"
                            />
                        </svg>
                        Search
                        <kbd className="hidden sm:inline-flex ml-1 px-1.5 py-0.5 text-[10px] font-mono bg-surface-raised text-muted rounded border border-border">
                            ⌘K
                        </kbd>
                    </Link>

                    {navLink("/analytics", "Analytics")}
                    {navLink("/download", "Extension")}
                    {navLink("/settings", "Settings")}

                    {/* Theme toggle */}
                    <button
                        onClick={cycleTheme}
                        title={`Theme: ${preference}`}
                        className="ml-1 p-1.5 rounded-md text-muted hover:bg-surface-hover hover:text-body transition-colors"
                    >
                        {THEME_ICONS[preference]}
                    </button>

                    {/* Logout */}
                    <button
                        onClick={logout}
                        className="ml-2 px-3 py-1.5 text-[13px] text-muted hover:text-red-600 transition-colors"
                    >
                        Log out
                    </button>
                </div>
            </div>
        </nav>
    );
}
