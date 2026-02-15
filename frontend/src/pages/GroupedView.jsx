import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import GroupFilters from "../components/GroupFilters";
import PostCard from "../components/PostCard";
import useAutoRefresh from "../hooks/useAutoRefresh";
import { usePostStore } from "../store/usePostStore";

function formatGroupLabel(groupBy) {
    if (!groupBy) return "";
    return groupBy.charAt(0).toUpperCase() + groupBy.slice(1);
}

function formatGroupId(groupBy, id) {
    if (!id) return "Uncategorized";
    if (groupBy === "tags") return `#${id}`;
    if (groupBy === "sentiment") return id.replace("_", " ");
    return id;
}

const RefreshIcon = ({ spinning }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className={`w-3.5 h-3.5 transition-transform duration-500 ${spinning ? "animate-spin" : ""}`}
    >
        <path
            fillRule="evenodd"
            d="M15.312 11.424a5.5 5.5 0 01-9.379 2.671l1.49-1.49A.75.75 0 006.893 11H2.75a.75.75 0 00-.75.75v4.143a.75.75 0 001.28.53l1.072-1.071a7.002 7.002 0 0011.735-3.222.75.75 0 00-.775-.706zm-10.624-2.85a5.5 5.5 0 019.376-2.67l-1.49 1.49a.75.75 0 00.53 1.53h4.143a.75.75 0 00.75-.75V2.75a.75.75 0 00-1.281-.53l-1.07 1.07A7.002 7.002 0 004.91 6.573a.75.75 0 00.776.706z"
            clipRule="evenodd"
        />
    </svg>
);

export default function GroupedView() {
    const { groupBy } = useParams();
    const { groups, loading, fetchGrouped, silentRefreshGrouped } = usePostStore();
    const [activeFilters, setActiveFilters] = useState(new Set());
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        if (groupBy) {
            fetchGrouped(groupBy);
        }
    }, [groupBy, fetchGrouped]);

    // Auto-refresh grouped data
    useAutoRefresh(silentRefreshGrouped, { interval: 15000 });

    async function handleManualRefresh() {
        setRefreshing(true);
        await silentRefreshGrouped();
        setTimeout(() => setRefreshing(false), 600);
    }

    const handleFilterChange = useCallback(filterSet => {
        setActiveFilters(filterSet);
    }, []);

    // Show all groups when nothing is selected, otherwise only matching ones
    const visibleGroups =
        activeFilters.size === 0 ? groups : groups.filter(g => activeFilters.has(g._id || "uncategorized"));

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-semibold text-body">Posts by {formatGroupLabel(groupBy)}</h1>
                <button
                    onClick={handleManualRefresh}
                    title="Refresh"
                    className="p-1.5 rounded-md text-muted hover:text-linkedin hover:bg-accent transition-colors"
                >
                    <RefreshIcon spinning={refreshing} />
                </button>
            </div>
            <GroupFilters groupBy={groupBy} onFilterChange={handleFilterChange} />

            {loading && <div className="text-center py-12 text-muted text-sm">Loading...</div>}

            {!loading && groups.length === 0 && (
                <div className="text-center py-12">
                    <p className="text-muted">No groups found</p>
                    <p className="text-muted text-sm mt-1">
                        {groupBy === "tags" || groupBy === "sentiment" || groupBy === "topic"
                            ? "Try clicking 'Analyze' on your posts to generate categories"
                            : "Save some posts from LinkedIn first"}
                    </p>
                </div>
            )}

            {!loading && groups.length > 0 && visibleGroups.length === 0 && (
                <div className="text-center py-12">
                    <p className="text-muted text-sm">No posts match the selected filters</p>
                </div>
            )}

            <div className="space-y-8">
                {visibleGroups.map(group => (
                    <div key={group._id || "uncategorized"}>
                        <div className="flex items-center gap-2 mb-3">
                            <h2 className="text-sm font-semibold text-body capitalize">
                                {formatGroupId(groupBy, group._id)}
                            </h2>
                            <span className="px-1.5 py-0.5 text-xs bg-surface-raised text-muted rounded">
                                {group.count}
                            </span>
                        </div>
                        <div className="space-y-3 pl-4 border-l-2 border-gray-200">
                            {group.posts.map(post => (
                                <PostCard key={post._id} post={post} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
