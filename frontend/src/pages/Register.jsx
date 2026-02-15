import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";

export default function Register() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const { register, loading, error, clearError } = useAuthStore();
    const navigate = useNavigate();

    async function handleSubmit(e) {
        e.preventDefault();
        try {
            await register(email, password, name);
            navigate("/");
        } catch {
            // error is set in store
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4 bg-page">
            <div className="w-full max-w-sm">
                <h1 className="text-2xl font-bold text-center text-body mb-1">Rightclicked</h1>
                <p className="text-center text-muted text-sm mb-6">Create your account</p>

                <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg p-6 space-y-4">
                    {error && (
                        <div className="p-3 text-sm text-red-600 bg-red-50 rounded">
                            {error}
                            <button onClick={clearError} className="ml-2 underline text-xs">
                                Dismiss
                            </button>
                        </div>
                    )}
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Full name"
                        required
                        className="w-full px-4 py-2.5 bg-surface border border-border rounded text-sm text-body focus:outline-none focus:border-linkedin"
                    />
                    <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="Email"
                        required
                        className="w-full px-4 py-2.5 bg-surface border border-border rounded text-sm text-body focus:outline-none focus:border-linkedin"
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Password (min 8 characters)"
                        required
                        minLength={8}
                        className="w-full px-4 py-2.5 bg-surface border border-border rounded text-sm text-body focus:outline-none focus:border-linkedin"
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 bg-linkedin text-white text-sm font-medium rounded hover:bg-linkedin-dark disabled:opacity-50 transition-colors"
                    >
                        {loading ? "Creating account..." : "Create Account"}
                    </button>
                </form>

                <p className="text-center text-sm text-muted mt-4">
                    Already have an account?{" "}
                    <Link to="/login" className="text-linkedin hover:underline">
                        Log in
                    </Link>
                </p>
            </div>
        </div>
    );
}
