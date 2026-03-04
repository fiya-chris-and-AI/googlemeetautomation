"use client";

import { useState, useEffect, useCallback } from "react";

interface AppUser {
    id: number;
    username: string;
    role: string;
    created_at: string;
    updated_at?: string;
}

export default function AdminLoginPage() {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // New user form
    const [newUsername, setNewUsername] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newRole, setNewRole] = useState<"admin" | "member">("member");
    const [adding, setAdding] = useState(false);

    // Edit state
    const [editId, setEditId] = useState<number | null>(null);
    const [editUsername, setEditUsername] = useState("");
    const [editPassword, setEditPassword] = useState("");
    const [editRole, setEditRole] = useState<"admin" | "member">("member");
    const [saving, setSaving] = useState(false);

    // Bypass token
    const [bypassUrl, setBypassUrl] = useState("");
    const [generating, setGenerating] = useState(false);
    const [copied, setCopied] = useState(false);

    const loadUsers = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/users");
            const data = await res.json();
            if (data.users) setUsers(data.users);
        } catch {
            setError("Failed to load users");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    async function addUser(e: React.FormEvent) {
        e.preventDefault();
        setAdding(true);
        setError("");
        setSuccess("");

        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: newUsername,
                    password: newPassword,
                    role: newRole,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Failed to create user");
                return;
            }

            setSuccess(`User "${newUsername}" created successfully`);
            setNewUsername("");
            setNewPassword("");
            setNewRole("member");
            loadUsers();
        } catch {
            setError("Network error");
        } finally {
            setAdding(false);
        }
    }

    function startEdit(user: AppUser) {
        setEditId(user.id);
        setEditUsername(user.username);
        setEditPassword("");
        setEditRole(user.role as "admin" | "member");
    }

    function cancelEdit() {
        setEditId(null);
        setEditUsername("");
        setEditPassword("");
    }

    async function saveEdit() {
        if (!editId) return;
        setSaving(true);
        setError("");
        setSuccess("");

        try {
            const body: Record<string, unknown> = { id: editId };
            if (editUsername) body.username = editUsername;
            if (editPassword) body.password = editPassword;
            body.role = editRole;

            const res = await fetch("/api/admin/users", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Failed to update user");
                return;
            }

            setSuccess("User updated successfully");
            cancelEdit();
            loadUsers();
        } catch {
            setError("Netzwerkfehler");
        } finally {
            setSaving(false);
        }
    }

    async function deleteUser(id: number, username: string) {
        if (!confirm(`Really delete user "${username}"?`)) return;
        setError("");
        setSuccess("");

        try {
            const res = await fetch("/api/admin/users", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.error || "Failed to delete user");
                return;
            }

            setSuccess(`User "${username}" deleted`);
            loadUsers();
        } catch {
            setError("Netzwerkfehler");
        }
    }

    async function generateToken() {
        setGenerating(true);
        setError("");
        setCopied(false);

        try {
            const res = await fetch("/api/auth/generate-token", { method: "POST" });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Token generation failed");
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
                User Management
            </h1>
            <p className="text-theme-text-secondary mb-8">
                Add, edit, and delete users
            </p>

            {/* Status Messages */}
            {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                    {error}
                </div>
            )}
            {success && (
                <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-sm">
                    {success}
                </div>
            )}

            {/* Add User Form */}
            <div className="bg-theme-card rounded-xl border border-theme-border p-6 mb-6">
                <h2 className="text-lg font-semibold text-theme-text mb-4">
                    ➕ Add New User
                </h2>
                <form onSubmit={addUser} className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[180px]">
                        <label className="block text-xs font-medium text-theme-text-secondary mb-1">
                            Username
                        </label>
                        <input
                            type="text"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-theme-border bg-theme-bg text-theme-text text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                            placeholder="e.g. Sarah"
                            required
                        />
                    </div>
                    <div className="flex-1 min-w-[180px]">
                        <label className="block text-xs font-medium text-theme-text-secondary mb-1">
                            Password
                        </label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-theme-border bg-theme-bg text-theme-text text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                            placeholder="Secure password"
                            required
                        />
                    </div>
                    <div className="w-[140px]">
                        <label className="block text-xs font-medium text-theme-text-secondary mb-1">
                            Role
                        </label>
                        <select
                            value={newRole}
                            onChange={(e) =>
                                setNewRole(e.target.value as "admin" | "member")
                            }
                            className="w-full px-3 py-2 rounded-lg border border-theme-border bg-theme-bg text-theme-text text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                        >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <button
                        type="submit"
                        disabled={adding}
                        className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        {adding ? "..." : "Add"}
                    </button>
                </form>
            </div>

            {/* Users Table */}
            <div className="bg-theme-card rounded-xl border border-theme-border p-6 mb-6">
                <h2 className="text-lg font-semibold text-theme-text mb-4">
                    👥 Registered Users
                </h2>

                {/* Info about env-var users */}
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-blue-700 dark:text-blue-400 text-xs">
                    💡 In addition to the users listed below, users from the environment
                    variables (ADMIN_USERNAME, USERS) are also active.
                </div>

                {loading ? (
                    <p className="text-theme-text-secondary text-sm">Loading users...</p>
                ) : users.length === 0 ? (
                    <p className="text-theme-text-secondary text-sm">
                        No users in the database yet. Use the form above to add users.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-theme-border">
                                    <th className="text-left py-2 px-3 text-theme-text-secondary font-medium">
                                        ID
                                    </th>
                                    <th className="text-left py-2 px-3 text-theme-text-secondary font-medium">
                                        Username
                                    </th>
                                    <th className="text-left py-2 px-3 text-theme-text-secondary font-medium">
                                        Role
                                    </th>
                                    <th className="text-left py-2 px-3 text-theme-text-secondary font-medium">
                                        Created
                                    </th>
                                    <th className="text-right py-2 px-3 text-theme-text-secondary font-medium">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => (
                                    <tr
                                        key={user.id}
                                        className="border-b border-theme-border/50"
                                    >
                                        {editId === user.id ? (
                                            <>
                                                <td className="py-2.5 px-3 text-theme-text-secondary">
                                                    {user.id}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <input
                                                        type="text"
                                                        value={editUsername}
                                                        onChange={(e) => setEditUsername(e.target.value)}
                                                        className="w-full px-2 py-1 rounded border border-theme-border bg-theme-bg text-theme-text text-xs"
                                                    />
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <select
                                                        value={editRole}
                                                        onChange={(e) =>
                                                            setEditRole(
                                                                e.target.value as "admin" | "member"
                                                            )
                                                        }
                                                        className="px-2 py-1 rounded border border-theme-border bg-theme-bg text-theme-text text-xs"
                                                    >
                                                        <option value="member">Mitglied</option>
                                                        <option value="admin">Admin</option>
                                                    </select>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <input
                                                        type="password"
                                                        value={editPassword}
                                                        onChange={(e) => setEditPassword(e.target.value)}
                                                        className="w-full px-2 py-1 rounded border border-theme-border bg-theme-bg text-theme-text text-xs"
                                                        placeholder="New password (leave empty to keep)"
                                                    />
                                                </td>
                                                <td className="py-2.5 px-3 text-right space-x-1">
                                                    <button
                                                        onClick={saveEdit}
                                                        disabled={saving}
                                                        className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
                                                    >
                                                        {saving ? "..." : "💾"}
                                                    </button>
                                                    <button
                                                        onClick={cancelEdit}
                                                        className="px-2 py-1 bg-gray-500 hover:bg-gray-600 text-white text-xs rounded transition-colors"
                                                    >
                                                        ✕
                                                    </button>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="py-2.5 px-3 text-theme-text-secondary">
                                                    {user.id}
                                                </td>
                                                <td className="py-2.5 px-3 text-theme-text font-medium">
                                                    {user.username}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <span
                                                        className={`px-2 py-0.5 rounded text-xs font-medium ${user.role === "admin"
                                                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                                            }`}
                                                    >
                                                        {user.role === "admin" ? "Admin" : "Member"}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3 text-theme-text-secondary text-xs">
                                                    {new Date(user.created_at).toLocaleDateString("en-US")}
                                                </td>
                                                <td className="py-2.5 px-3 text-right space-x-1">
                                                    <button
                                                        onClick={() => startEdit(user)}
                                                        className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        onClick={() => deleteUser(user.id, user.username)}
                                                        className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                                                    >
                                                        🗑️
                                                    </button>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Token Generation */}
            <div className="bg-theme-card rounded-xl border border-theme-border p-6">
                <h2 className="text-lg font-semibold text-theme-text mb-2">
                    🔑 Community Bypass Token
                </h2>
                <p className="text-sm text-theme-text-secondary mb-4">
                    Generate an access link for the ScienceExperts.ai Community. This link
                    allows members to access the app without separate login credentials.
                </p>

                <button
                    onClick={generateToken}
                    disabled={generating}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium rounded-lg transition-colors"
                >
                    {generating ? "Generating..." : "🔑 Generate Token"}
                </button>

                {bypassUrl && (
                    <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                        <p className="text-sm font-medium text-green-800 dark:text-green-400 mb-2">
                            ✅ Bypass URL generated:
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
                                {copied ? "✅ Copied!" : "📋 Copy"}
                            </button>
                        </div>
                        <p className="text-xs text-green-700 dark:text-green-500 mt-2">
                            Add this link to the Community under Admin Tools.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
