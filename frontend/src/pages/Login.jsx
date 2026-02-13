import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const { login, loading, error, clearError } = useAuthStore();
    const navigate = useNavigate();

    async function handleSubmit(e) {
        e.preventDefault();
        try {
            await login(email, password);
            navigate("/");
        } catch {
            // error is set in store
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4 bg-page">
            <div className="w-full max-w-sm">
                <h1 className="text-2xl font-bold text-center text-body mb-1">Rightclicked</h1>
                <p className="text-center text-muted text-sm mb-6">Log in to your account</p>

                <form onSubmit={handleSubmit} className="bg-white border border-border rounded-lg p-6 space-y-4">
                    {error && (
                        <div className="p-3 text-sm text-red-600 bg-red-50 rounded">
                            {error}
                            <button onClick={clearError} className="ml-2 underline text-xs">
                                Dismiss
                            </button>
                        </div>
                    )}
                    <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="Email"
                        required
                        className="w-full px-4 py-2.5 border border-border rounded text-sm focus:outline-none focus:border-linkedin"
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Password"
                        required
                        className="w-full px-4 py-2.5 border border-border rounded text-sm focus:outline-none focus:border-linkedin"
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 bg-linkedin text-white text-sm font-medium rounded hover:bg-linkedin-dark disabled:opacity-50 transition-colors"
                    >
                        {loading ? "Logging in..." : "Log In"}
                    </button>
                </form>

                <p className="text-center text-sm text-muted mt-4">
                    No account?{" "}
                    <Link to="/register" className="text-linkedin hover:underline">
                        Register
                    </Link>
                </p>
            </div>
        </div>
    );
}
