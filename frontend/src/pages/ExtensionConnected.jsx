export default function ExtensionConnected() {
    return (
        <div className="min-h-screen flex items-center justify-center px-4 bg-page">
            <div className="w-full max-w-sm text-center">
                <div className="text-5xl mb-4">✅</div>
                <h1 className="text-2xl font-bold text-body mb-2">Extension Connected!</h1>
                <p className="text-muted text-sm mb-6">
                    Your Rightclicked extension is now linked to your account. This tab will close automatically.
                </p>
                <p className="text-muted text-xs">If it doesn't close, you can safely close it yourself.</p>
            </div>
        </div>
    );
}
