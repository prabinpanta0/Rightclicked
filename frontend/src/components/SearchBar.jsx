import { useState } from "react";

export default function SearchBar({ onSearch, placeholder = "Search posts…" }) {
    const [query, setQuery] = useState("");

    function handleSubmit(e) {
        e.preventDefault();
        onSearch(query.trim());
    }

    return (
        <form onSubmit={handleSubmit} className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path
                        fillRule="evenodd"
                        d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                        clipRule="evenodd"
                    />
                </svg>
            </div>
            <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-body placeholder:text-muted focus:outline-none focus:border-linkedin focus:ring-1 focus:ring-linkedin/20 transition-all"
            />
        </form>
    );
}
