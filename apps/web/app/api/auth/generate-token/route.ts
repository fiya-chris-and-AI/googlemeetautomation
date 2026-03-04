import { NextResponse } from "next/server";
import { getSessionFromCookies, generateAccessToken } from "@/lib/auth";

export async function POST() {
    try {
        const session = await getSessionFromCookies();
        if (!session || session.role !== "admin") {
            return NextResponse.json(
                { error: "Nur Administratoren können Tokens generieren" },
                { status: 403 }
            );
        }

        const token = await generateAccessToken();
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const bypassUrl = `${appUrl}/api/auth/token-login?token=${token}`;

        return NextResponse.json({ token, bypassUrl });
    } catch (error) {
        console.error("[Auth] Token generation error:", error);
        return NextResponse.json(
            { error: "Token-Generierung fehlgeschlagen" },
            { status: 500 }
        );
    }
}
