import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";

export default function ConnectExtension() {
    const token = useAuthStore(s => s.token);
    const navigate = useNavigate();

    // If not logged in, bounce to login with ext=1 so it comes back here after auth
    useEffect(() => {
        if (!token) {
            navigate("/login?ext=1", { replace: true });
        }
    }, [token, navigate]);

    function handleConnect() {
        // Navigate to /extension-connected with token in URL.
        // The extension's background.js tabs.onUpdated listener captures the token from the URL.
        navigate(`/extension-connected?token=${encodeURIComponent(token)}`);
    }

    if (!token) return null;

    return (
        <div className="min-h-screen flex items-center justify-center px-4 bg-page">
            <div className="w-full max-w-sm text-center">
                <div className="text-5xl mb-4">🔗</div>
                <h1 className="text-2xl font-bold text-body mb-2">Connect Extension</h1>
                <p className="text-muted text-sm mb-6">
                    Link your Rightclicked browser extension to your account. This lets the extension save posts
                    directly.
                </p>
                <button
                    onClick={handleConnect}
                    className="w-full py-2.5 bg-linkedin text-white text-sm font-medium rounded hover:bg-linkedin-dark transition-colors"
                >
                    Connect Extension
                </button>
                <p className="text-muted text-xs mt-4">
                    You're logged in. Click the button above to link your extension.
                </p>
            </div>
        </div>
    );
}
