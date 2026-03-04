import { NextResponse } from "next/server";
import { findUserAnywhere, verifyPassword } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
    try {
        const { username, password } = await request.json();

        if (!username || !password) {
            return NextResponse.json(
                { error: "Benutzername und Passwort erforderlich" },
                { status: 400 }
            );
        }

        const user = await findUserAnywhere(username);
        if (!user || !verifyPassword(user, password)) {
            return NextResponse.json(
                { error: "Ungültige Anmeldedaten" },
                { status: 401 }
            );
        }

        const token = await createSession({
            userId: user.id,
            username: user.username,
            role: user.role,
        });

        const response = NextResponse.json({
            success: true,
            user: { id: user.id, username: user.username, role: user.role },
        });

        return setSessionCookie(response, token);
    } catch (error) {
        console.error("[Auth] Login error:", error);
        return NextResponse.json(
            { error: "Anmeldung fehlgeschlagen" },
            { status: 500 }
        );
    }
}
