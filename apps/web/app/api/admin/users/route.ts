import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase";
import { hashSync, compareSync } from "bcryptjs";

// Ensure app_users table exists
async function ensureTable() {
    const sb = getServerSupabase();
    // Try a quick select — if table doesn't exist, create it
    const { error } = await sb.from("app_users").select("id").limit(1);
    if (error && error.code === "PGRST204") {
        // Empty result, table exists
        return true;
    }
    if (error && (error.code === "42P01" || error.message.includes("app_users"))) {
        // Table doesn't exist — we'll handle this in the GET response
        return false;
    }
    return true;
}

// GET: List all users (admin only)
export async function GET() {
    try {
        const session = await getSessionFromCookies();
        if (!session || session.role !== "admin") {
            return NextResponse.json({ error: "Nur Administratoren" }, { status: 403 });
        }

        const sb = getServerSupabase();
        const { data, error } = await sb
            .from("app_users")
            .select("id, username, role, created_at, updated_at")
            .order("id", { ascending: true });

        if (error) {
            // Table might not exist — return empty with setup flag
            return NextResponse.json({ users: [], needsSetup: true });
        }

        return NextResponse.json({ users: data || [], needsSetup: false });
    } catch (error) {
        console.error("[Admin] List users error:", error);
        return NextResponse.json({ error: "Fehler beim Laden der Benutzer" }, { status: 500 });
    }
}

// POST: Create a new user (admin only)
export async function POST(request: Request) {
    try {
        const session = await getSessionFromCookies();
        if (!session || session.role !== "admin") {
            return NextResponse.json({ error: "Nur Administratoren" }, { status: 403 });
        }

        const { username, password, role } = await request.json();

        if (!username || !password) {
            return NextResponse.json(
                { error: "Benutzername und Passwort erforderlich" },
                { status: 400 }
            );
        }

        const validRole = role === "admin" ? "admin" : "member";
        const passwordHash = hashSync(password, 10);

        const sb = getServerSupabase();
        const { data, error } = await sb
            .from("app_users")
            .insert({ username, password: passwordHash, role: validRole })
            .select("id, username, role, created_at")
            .single();

        if (error) {
            if (error.code === "23505") {
                return NextResponse.json(
                    { error: "Benutzername existiert bereits" },
                    { status: 409 }
                );
            }
            console.error("[Admin] Create user error:", error);
            return NextResponse.json(
                { error: "Benutzer konnte nicht erstellt werden" },
                { status: 500 }
            );
        }

        return NextResponse.json({ user: data }, { status: 201 });
    } catch (error) {
        console.error("[Admin] Create user error:", error);
        return NextResponse.json(
            { error: "Benutzer konnte nicht erstellt werden" },
            { status: 500 }
        );
    }
}

// PUT: Update a user (admin only)
export async function PUT(request: Request) {
    try {
        const session = await getSessionFromCookies();
        if (!session || session.role !== "admin") {
            return NextResponse.json({ error: "Nur Administratoren" }, { status: 403 });
        }

        const { id, username, password, role } = await request.json();

        if (!id) {
            return NextResponse.json({ error: "Benutzer-ID erforderlich" }, { status: 400 });
        }

        const updates: Record<string, string> = { updated_at: new Date().toISOString() };
        if (username) updates.username = username;
        if (password) updates.password = hashSync(password, 10);
        if (role) updates.role = role === "admin" ? "admin" : "member";

        const sb = getServerSupabase();
        const { data, error } = await sb
            .from("app_users")
            .update(updates)
            .eq("id", id)
            .select("id, username, role, updated_at")
            .single();

        if (error) {
            console.error("[Admin] Update user error:", error);
            return NextResponse.json(
                { error: "Benutzer konnte nicht aktualisiert werden" },
                { status: 500 }
            );
        }

        return NextResponse.json({ user: data });
    } catch (error) {
        console.error("[Admin] Update user error:", error);
        return NextResponse.json(
            { error: "Benutzer konnte nicht aktualisiert werden" },
            { status: 500 }
        );
    }
}

// DELETE: Remove a user (admin only)
export async function DELETE(request: Request) {
    try {
        const session = await getSessionFromCookies();
        if (!session || session.role !== "admin") {
            return NextResponse.json({ error: "Nur Administratoren" }, { status: 403 });
        }

        const { id } = await request.json();

        if (!id) {
            return NextResponse.json({ error: "Benutzer-ID erforderlich" }, { status: 400 });
        }

        const sb = getServerSupabase();
        const { error } = await sb.from("app_users").delete().eq("id", id);

        if (error) {
            console.error("[Admin] Delete user error:", error);
            return NextResponse.json(
                { error: "Benutzer konnte nicht gelöscht werden" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Admin] Delete user error:", error);
        return NextResponse.json(
            { error: "Benutzer konnte nicht gelöscht werden" },
            { status: 500 }
        );
    }
}
