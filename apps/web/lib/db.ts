import { compareSync, hashSync } from "bcryptjs";

export interface User {
    id: number;
    username: string;
    password_hash: string;
    role: "admin" | "member";
    created_at: string;
}

function loadUsers(): User[] {
    const users: User[] = [];
    let id = 1;

    // 1. Primary admin from dedicated env vars
    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminPassword = process.env.ADMIN_PASSWORD || "changeme";
    users.push({
        id: id++,
        username: adminUsername,
        password_hash: hashSync(adminPassword, 10),
        role: "admin",
        created_at: new Date().toISOString(),
    });

    // 2. Extra users from USERS env var (JSON array)
    // Format: [{"username":"user1","password":"pw","role":"member"}]
    const usersJson = process.env.USERS;
    if (usersJson) {
        try {
            const parsed = JSON.parse(usersJson);
            for (const u of parsed) {
                users.push({
                    id: id++,
                    username: u.username,
                    password_hash: hashSync(u.password, 10),
                    role: u.role || "member",
                    created_at: new Date().toISOString(),
                });
            }
        } catch (err) {
            console.error("[Auth] Failed to parse USERS env var", err);
        }
    }
    return users;
}

let _cachedUsers: User[] | null = null;

export function getUsers(): User[] {
    if (!_cachedUsers) _cachedUsers = loadUsers();
    return _cachedUsers;
}

export function findUserByUsername(username: string): User | undefined {
    return getUsers().find(
        (u) => u.username.toLowerCase() === username.toLowerCase()
    );
}

export function verifyPassword(user: User, password: string): boolean {
    return compareSync(password, user.password_hash);
}

// ── Supabase DB User Lookup ──

/**
 * Also try finding the user in Supabase app_users table.
 * Password is stored as bcrypt hash in the DB already.
 */
export async function findUserInDB(
    username: string
): Promise<User | null> {
    try {
        const { getServerSupabase } = await import("./supabase");
        const sb = getServerSupabase();
        const { data, error } = await sb
            .from("app_users")
            .select("id, username, password, role, created_at")
            .ilike("username", username)
            .single();

        if (error || !data) return null;

        return {
            id: data.id,
            username: data.username,
            password_hash: data.password,
            role: data.role as "admin" | "member",
            created_at: data.created_at,
        };
    } catch {
        return null;
    }
}

/**
 * Combined lookup: env-var users first (instant), then Supabase DB.
 */
export async function findUserAnywhere(
    username: string
): Promise<User | null> {
    const envUser = findUserByUsername(username);
    if (envUser) return envUser;
    return findUserInDB(username);
}
