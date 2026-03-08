"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "../../lib/locale";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { t } = useLocale();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || t('login.error.default'));
                return;
            }

            router.push("/");
            router.refresh();
        } catch {
            setError(t('login.error.network'));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-theme-bg px-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <img
                        src="https://rgltabjdjrbmbjrjoqga.supabase.co/storage/v1/object/public/community-assets/community-logo-1772070053980.png"
                        alt="ScienceExperts.ai"
                        className="h-16 mx-auto dark:hidden"
                    />
                    <img
                        src="https://rgltabjdjrbmbjrjoqga.supabase.co/storage/v1/object/public/community-assets/community-logo-dark-1772073090031.png"
                        alt="ScienceExperts.ai"
                        className="h-16 mx-auto hidden dark:block"
                    />
                    <p className="text-sm text-theme-text-secondary mt-2">
                        {t('login.subtitle')}
                    </p>
                </div>

                {/* Login Card */}
                <div className="bg-theme-card rounded-xl border border-theme-border shadow-lg p-8">
                    <h1 className="text-2xl font-bold text-theme-text mb-6 text-center">
                        {t('login.title')}
                    </h1>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label
                                htmlFor="username"
                                className="block text-sm font-medium text-theme-text-secondary mb-1.5"
                            >
                                {t('login.username')}
                            </label>
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-lg border border-theme-border bg-theme-bg text-theme-text placeholder-theme-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                                placeholder={t('login.username.placeholder')}
                                required
                                autoFocus
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="password"
                                className="block text-sm font-medium text-theme-text-secondary mb-1.5"
                            >
                                {t('login.password')}
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-lg border border-theme-border bg-theme-bg text-theme-text placeholder-theme-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                                placeholder={t('login.password.placeholder')}
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                        >
                            {loading ? t('login.button.loading') : t('login.button')}
                        </button>
                    </form>
                </div>


            </div>
        </div>
    );
}
