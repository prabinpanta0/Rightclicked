import { useAuthStore } from "../store/useAuthStore";

export default function Settings() {
    const { user, logout } = useAuthStore();

    return (
        <div className="max-w-xl mx-auto px-4 py-8">
            <h1 className="text-xl font-semibold text-body mb-6">Settings</h1>

            <div className="bg-white border border-border rounded-lg p-6 space-y-6">
                <div>
                    <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-1">Account</h2>
                    <p className="text-sm text-body">{user?.name || "User"}</p>
                    <p className="text-sm text-muted">{user?.email || ""}</p>
                </div>

                <div>
                    <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Extension Setup</h2>
                    <ol className="text-sm text-body/80 space-y-1 list-decimal list-inside">
                        <li>Open Chrome and go to chrome://extensions</li>
                        <li>Enable Developer mode</li>
                        <li>Click "Load unpacked" and select the extension folder</li>
                        <li>Log in via the extension popup on LinkedIn</li>
                    </ol>
                </div>

                <div>
                    <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-2">API</h2>
                    <p className="text-sm text-muted">
                        Backend:{" "}
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-body">
                            http://localhost:3001
                        </code>
                    </p>
                </div>

                <div className="pt-4 border-t border-gray-100">
                    <button
                        onClick={logout}
                        className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
                    >
                        Log out
                    </button>
                </div>
            </div>
        </div>
    );
}
