import { Link, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";

export default function Navbar() {
    const location = useLocation();
    const logout = useAuthStore(s => s.logout);

    const links = [
        { to: "/", label: "Dashboard" },
        { to: "/groups/author", label: "By Author" },
        { to: "/groups/topic", label: "By Topic" },
        { to: "/groups/date", label: "By Date" },
        { to: "/groups/tags", label: "By Tags" },
        { to: "/groups/sentiment", label: "By Sentiment" },
        { to: "/groups/engagement", label: "By Engagement" },
        { to: "/search", label: "Search" },
        { to: "/analytics", label: "Analytics" },
        { to: "/settings", label: "Settings" },
    ];

    function isActive(to) {
        return location.pathname === to;
    }

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-border">
            <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
                <Link to="/" className="text-lg font-bold text-linkedin">
                    Rightclicked
                </Link>
                <div className="flex items-center gap-0.5">
                    {links.map(({ to, label }) => (
                        <Link
                            key={to}
                            to={to}
                            className={`px-3 py-1.5 text-[13px] rounded-md transition-colors ${
                                isActive(to) ? "bg-blue-50 text-linkedin font-medium" : "text-muted hover:bg-gray-50"
                            }`}
                        >
                            {label}
                        </Link>
                    ))}
                    <button
                        onClick={logout}
                        className="ml-3 px-3 py-1.5 text-[13px] text-muted hover:text-red-600 transition-colors"
                    >
                        Log out
                    </button>
                </div>
            </div>
        </nav>
    );
}
