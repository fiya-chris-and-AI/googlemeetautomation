import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionFromRequest } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/token-login", "/api/auth/logout"];

export async function middleware(request: NextRequest) {
    const { pathname, searchParams } = request.nextUrl;

    // 1. Skip static assets and public paths
    if (
        pathname.startsWith("/_next") ||
        pathname.startsWith("/api/auth") ||
        pathname.match(/\.(ico|png|jpg|jpeg|svg|webp|css|js|woff2?)$/) ||
        PUBLIC_PATHS.includes(pathname)
    ) {
        return NextResponse.next();
    }

    // 2. Check for Session Cookie
    const session = await verifySessionFromRequest(request);
    if (session) return NextResponse.next();

    // 3. Handle Bypass (Token in URL)
    const accessToken = searchParams.get("access_token");
    if (accessToken) {
        return NextResponse.redirect(
            new URL(`/api/auth/token-login?token=${accessToken}`, request.url)
        );
    }

    // 4. Default: Redirect to Login
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
