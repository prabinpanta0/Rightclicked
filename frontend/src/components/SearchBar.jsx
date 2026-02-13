import { useState } from "react";

export default function SearchBar({ onSearch, placeholder = "Search posts..." }) {
    const [query, setQuery] = useState("");

    function handleSubmit(e) {
        e.preventDefault();
        onSearch(query.trim());
    }

    return (
        <form onSubmit={handleSubmit} className="flex gap-2">
            <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={placeholder}
                className="flex-1 px-4 py-2 border border-border rounded text-sm focus:outline-none focus:border-linkedin"
            />
            <button
                type="submit"
                className="px-4 py-2 bg-linkedin text-white text-sm font-medium rounded hover:bg-linkedin-dark transition-colors"
            >
                Search
            </button>
        </form>
    );
}
