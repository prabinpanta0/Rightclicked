import { Link } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";

const GITHUB_REPO = "https://github.com/prabinpanta0/Rightclicked";
const GITHUB_RELEASES = `${GITHUB_REPO}/releases`;
const GITHUB_EXT_ZIP = `${GITHUB_REPO}/archive/refs/heads/Rightclicked.zip`;

const steps = [
    {
        num: "1",
        title: "Download the extension",
        desc: (
            <>
                Download the ZIP from GitHub and extract the{" "}
                <code className="px-1.5 py-0.5 bg-surface-raised text-linkedin text-xs rounded font-mono">
                    extension/
                </code>{" "}
                folder anywhere on your computer.
            </>
        ),
    },
    {
        num: "2",
        title: "Open browser extensions page",
        desc: (
            <>
                Go to{" "}
                <code className="px-1.5 py-0.5 bg-surface-raised text-linkedin text-xs rounded font-mono">
                    chrome://extensions
                </code>{" "}
                (Chrome) or{" "}
                <code className="px-1.5 py-0.5 bg-surface-raised text-linkedin text-xs rounded font-mono">
                    edge://extensions
                </code>{" "}
                (Edge) and enable <strong>Developer mode</strong>.
            </>
        ),
    },
    {
        num: "3",
        title: "Load unpacked extension",
        desc: (
            <>
                Click <strong>"Load unpacked"</strong> and select the extracted{" "}
                <code className="px-1.5 py-0.5 bg-surface-raised text-linkedin text-xs rounded font-mono">
                    extension/
                </code>{" "}
                folder. The Rightclicked icon will appear in your toolbar.
            </>
        ),
    },
    {
        num: "4",
        title: "Connect your account",
        desc: (
            <>
                Click the extension icon and hit <strong>"Connect"</strong>. You'll be redirected here to link it to
                your account.
            </>
        ),
    },
];


export default function Download() {
    const token = useAuthStore(s => s.token);

    return (
        <div className="min-h-screen bg-page overflow-hidden">
            <div className="max-w-3xl mx-auto px-4 py-12">
                {/* Hero */}
                <div className="text-center mb-10">
                    <h1 className="text-3xl font-bold text-body mb-2">Get the Extension</h1>
                    <p className="text-muted max-w-md mx-auto">
                        Right-click any LinkedIn post to save it. The browser extension works with any Chromium-based
                        browser.
                    </p>
                </div>

                {/* Download buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
                    <a
                        href={GITHUB_EXT_ZIP}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-linkedin text-white font-medium rounded-lg hover:bg-linkedin-dark transition-colors shadow-sm"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="w-5 h-5"
                        >
                            <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                            <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                        </svg>
                        Download ZIP from GitHub
                    </a>
                    <a
                        href={GITHUB_RELEASES}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-surface border border-border text-body font-medium rounded-lg hover:bg-surface-hover transition-colors"
                    >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                        </svg>
                        View on GitHub
                    </a>
                </div>

                {/* Installation steps */}
                <div className="bg-surface border border-border rounded-xl p-6 mb-8">
                    <h2 className="text-lg font-bold text-body mb-5">Installation Steps</h2>
                    <div className="space-y-5">
                        {steps.map(step => (
                            <div key={step.num} className="flex gap-4">
                                <div className="w-8 h-8 rounded-full bg-linkedin/10 text-linkedin font-bold text-sm flex items-center justify-center shrink-0 mt-0.5">
                                    {step.num}
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-body mb-1">{step.title}</h3>
                                    <p className="text-sm text-muted leading-relaxed">{step.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>


                {/* Already have it? */}
                <div className="text-center text-sm text-muted">
                    Already installed?{" "}
                    {token ? (
                        <Link to="/connect-extension" className="text-linkedin hover:underline font-medium">
                            Connect your extension →
                        </Link>
                    ) : (
                        <Link to="/login?ext=1" className="text-linkedin hover:underline font-medium">
                            Log in to connect →
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}
