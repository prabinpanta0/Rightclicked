import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import Analytics from "./pages/Analytics";
import ConnectExtension from "./pages/ConnectExtension";
import Dashboard from "./pages/Dashboard";
import Download from "./pages/Download";
import ExtensionConnected from "./pages/ExtensionConnected";
import GroupedView from "./pages/GroupedView";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Search from "./pages/Search";
import Settings from "./pages/Settings";
import { useAuthStore } from "./store/useAuthStore";

function ProtectedRoute({ children }) {
    const token = useAuthStore(s => s.token);
    if (!token) return <Navigate to="/login" replace />;
    return children;
}

export default function App() {
    const token = useAuthStore(s => s.token);

    return (
        <div className="min-h-screen">
            {token && <Navbar />}
            <main className={token ? "pt-14" : ""}>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/download" element={<Download />} />
                    <Route path="/connect-extension" element={<ConnectExtension />} />
                    <Route path="/extension-connected" element={<ExtensionConnected />} />
                    <Route
                        path="/"
                        element={
                            <ProtectedRoute>
                                <Dashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/groups/:groupBy"
                        element={
                            <ProtectedRoute>
                                <GroupedView />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/search"
                        element={
                            <ProtectedRoute>
                                <Search />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/settings"
                        element={
                            <ProtectedRoute>
                                <Settings />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/analytics"
                        element={
                            <ProtectedRoute>
                                <Analytics />
                            </ProtectedRoute>
                        }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
        </div>
    );
}
