import { Link, useParams } from "react-router-dom";

const GROUP_OPTIONS = [
    { key: "author", label: "By Author" },
    { key: "topic", label: "By Topic" },
    { key: "date", label: "By Date" },
    { key: "tags", label: "By Tags" },
    { key: "sentiment", label: "By Sentiment" },
];

export default function GroupSelector() {
    const { groupBy } = useParams();

    return (
        <div className="flex gap-1.5 mb-6">
            {GROUP_OPTIONS.map(({ key, label }) => (
                <Link
                    key={key}
                    to={`/groups/${key}`}
                    className={`px-3 py-1 text-[13px] rounded border transition-colors ${
                        groupBy === key
                            ? "bg-blue-50 text-linkedin border-linkedin"
                            : "bg-white text-muted border-border hover:border-gray-400"
                    }`}
                >
                    {label}
                </Link>
            ))}
        </div>
    );
}
