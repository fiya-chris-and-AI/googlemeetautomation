"use client";

import { useState, useEffect } from "react";

export default function AdminUsersPage() {
    const [users, setUsers] = useState<
        { id: number; username: string; role: string }[]
    >([]);
    const [bypassUrl, setBypassUrl] = useState("");
    const [generating, setGenerating] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        // Fetch users list from session info
        fetch("/api/auth/login", { method: "GET" })
            .then(() => {
                // Users are env-var based, we'll just show a placeholder
            })
            .catch(() => { });
    }, []);

    async function generateToken() {
        setGenerating(true);
        setError("");
        setCopied(false);

        try {
            const res = await fetch("/api/auth/generate-token", { method: "POST" });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Token-Generierung fehlgeschlagen");
                return;
            }

            setBypassUrl(data.bypassUrl);
        } catch {
            setError("Netzwerkfehler");
        } finally {
            setGenerating(false);
        }
    }

    async function copyToClipboard() {
        try {
            await navigator.clipboard.writeText(bypassUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
        } catch {
            // Fallback
            const input = document.createElement("input");
            input.value = bypassUrl;
            document.body.appendChild(input);
            input.select();
            document.execCommand("copy");
            document.body.removeChild(input);
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
        }
    }

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-theme-text mb-2">
                Benutzerverwaltung
            </h1>
            <p className="text-theme-text-secondary mb-8">
                Verwalte Benutzer und generiere Community-Zugangstokens
            </p>

            {/* Users Table */}
            <div className="bg-theme-card rounded-xl border border-theme-border p-6 mb-8">
                <h2 className="text-lg font-semibold text-theme-text mb-4">
                    Registrierte Benutzer
                </h2>
                <p className="text-sm text-theme-text-secondary mb-4">
                    Benutzer werden über Umgebungsvariablen definiert (ADMIN_USERNAME,
                    USERS).
                </p>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-theme-border">
                                <th className="text-left py-2 px-3 text-theme-text-secondary font-medium">
                                    Typ
                                </th>
                                <th className="text-left py-2 px-3 text-theme-text-secondary font-medium">
                                    Variable
                                </th>
                                <th className="text-left py-2 px-3 text-theme-text-secondary font-medium">
                                    Beschreibung
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-b border-theme-border/50">
                                <td className="py-2.5 px-3">
                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                        Admin
                                    </span>
                                </td>
                                <td className="py-2.5 px-3 text-theme-text font-mono text-xs">
                                    ADMIN_USERNAME / ADMIN_PASSWORD
                                </td>
                                <td className="py-2.5 px-3 text-theme-text-secondary">
                                    Haupt-Administrator
                                </td>
                            </tr>
                            <tr className="border-b border-theme-border/50">
                                <td className="py-2.5 px-3">
                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                        Mitglieder
                                    </span>
                                </td>
                                <td className="py-2.5 px-3 text-theme-text font-mono text-xs">
                                    USERS
                                </td>
                                <td className="py-2.5 px-3 text-theme-text-secondary">
                                    JSON-Array mit Benutzern
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Token Generation */}
            <div className="bg-theme-card rounded-xl border border-theme-border p-6">
                <h2 className="text-lg font-semibold text-theme-text mb-2">
                    Community Bypass Token
                </h2>
                <p className="text-sm text-theme-text-secondary mb-4">
                    Generiere einen Zugangslink für die ScienceExperts.ai Community. Dieser
                    Link ermöglicht Mitgliedern den Zugang ohne separate Anmeldedaten.
                </p>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                        {error}
                    </div>
                )}

                <button
                    onClick={generateToken}
                    disabled={generating}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                    {generating ? "Generiere..." : "🔑 Token generieren"}
                </button>

                {bypassUrl && (
                    <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                        <p className="text-sm font-medium text-green-800 dark:text-green-400 mb-2">
                            ✅ Bypass-URL generiert:
                        </p>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                readOnly
                                value={bypassUrl}
                                className="flex-1 px-3 py-2 text-xs font-mono bg-white dark:bg-gray-800 border border-green-300 dark:border-green-700 rounded text-theme-text"
                            />
                            <button
                                onClick={copyToClipboard}
                                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors whitespace-nowrap"
                            >
                                {copied ? "✅ Kopiert!" : "📋 Kopieren"}
                            </button>
                        </div>
                        <p className="text-xs text-green-700 dark:text-green-500 mt-2">
                            Diesen Link in der Community unter Admin Tools einfügen.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
