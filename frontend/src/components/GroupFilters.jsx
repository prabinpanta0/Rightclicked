import { useEffect, useState } from "react";
import { usePostStore } from "../store/usePostStore";

function formatFilterLabel(groupBy, id) {
    if (!id) return "Uncategorized";
    if (groupBy === "tags") return `#${id}`;
    if (groupBy === "sentiment") {
        return id.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase());
    }
    return id;
}

export default function GroupFilters({ groupBy, onFilterChange }) {
    const { groups } = usePostStore();
    const [selected, setSelected] = useState(new Set());

    // Reset selection when groupBy changes
    useEffect(() => {
        setSelected(new Set());
    }, [groupBy]);

    // Notify parent whenever selection changes
    useEffect(() => {
        onFilterChange?.(selected);
    }, [selected, onFilterChange]);

    function toggle(id) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    function clearAll() {
        setSelected(new Set());
    }

    if (!groups || groups.length === 0) {
        return null;
    }

    const noneSelected = selected.size === 0;

    return (
        <div className="mb-6">
            <div className="flex flex-wrap gap-1.5">
                <button
                    onClick={clearAll}
                    className={`px-3 py-1 text-[13px] rounded-lg border transition-colors ${
                        noneSelected
                            ? "bg-accent text-linkedin border-linkedin"
                            : "bg-surface text-muted border-border hover:border-muted"
                    }`}
                >
                    All
                </button>
                {groups.map(group => {
                    const id = group._id || "uncategorized";
                    const isActive = selected.has(id);
                    return (
                        <button
                            key={id}
                            onClick={() => toggle(id)}
                            className={`px-3 py-1 text-[13px] rounded-lg border transition-colors ${
                                isActive
                                    ? "bg-accent text-linkedin border-linkedin"
                                    : "bg-surface text-muted border-border hover:border-muted"
                            }`}
                        >
                            {formatFilterLabel(groupBy, group._id)}
                            <span className="ml-1.5 text-xs text-muted">{group.count}</span>
                        </button>
                    );
                })}
            </div>
            {selected.size > 1 && (
                <button onClick={clearAll} className="mt-2 text-xs text-muted hover:text-body transition-colors">
                    Clear filters
                </button>
            )}
        </div>
    );
}
