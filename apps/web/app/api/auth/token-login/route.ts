import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAccessToken, createSession, setSessionCookie } from "@/lib/auth";

export async function GET(request: NextRequest) {
    const token = request.nextUrl.searchParams.get("token");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (!token) {
        return NextResponse.redirect(new URL("/login", appUrl));
    }

    const valid = await verifyAccessToken(token);
    if (!valid) {
        return NextResponse.redirect(new URL("/login?error=invalid_token", appUrl));
    }

    // Create a session for the bypass user
    const sessionToken = await createSession({
        userId: 0,
        username: "community-member",
        role: "member",
    });

    const response = NextResponse.redirect(new URL("/", appUrl));
    return setSessionCookie(response, sessionToken);
}
