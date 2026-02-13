import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import GroupFilters from "../components/GroupFilters";
import PostCard from "../components/PostCard";
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

export default function GroupedView() {
    const { groupBy } = useParams();
    const { groups, loading, fetchGrouped } = usePostStore();
    const [activeFilters, setActiveFilters] = useState(new Set());

    useEffect(() => {
        if (groupBy) {
            fetchGrouped(groupBy);
        }
    }, [groupBy, fetchGrouped]);

    const handleFilterChange = useCallback(filterSet => {
        setActiveFilters(filterSet);
    }, []);

    // Show all groups when nothing is selected, otherwise only matching ones
    const visibleGroups =
        activeFilters.size === 0 ? groups : groups.filter(g => activeFilters.has(g._id || "uncategorized"));

    return (
        <div className="max-w-3xl mx-auto px-4 py-8">
            <h1 className="text-xl font-semibold text-body mb-4">Posts by {formatGroupLabel(groupBy)}</h1>
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
                            <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-muted rounded">{group.count}</span>
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
