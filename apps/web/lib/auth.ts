import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "session";
const SESSION_EXPIRY = "7d";
const ACCESS_TOKEN_EXPIRY = "365d";

// ── Secrets ──

function getAuthSecret(): Uint8Array {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET environment variable is required");
    return new TextEncoder().encode(secret);
}

function getAccessTokenSecret(): Uint8Array {
    const secret = process.env.ACCESS_TOKEN_SECRET;
    if (!secret)
        throw new Error("ACCESS_TOKEN_SECRET environment variable is required");
    return new TextEncoder().encode(secret);
}

// ── Session Management ──

export interface SessionPayload {
    userId: number;
    username: string;
    role: "admin" | "member";
}

export async function createSession(payload: SessionPayload): Promise<string> {
    return await new SignJWT(payload as unknown as Record<string, unknown>)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(SESSION_EXPIRY)
        .sign(getAuthSecret());
}

export async function verifySession(
    token: string
): Promise<SessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, getAuthSecret());
        return payload as unknown as SessionPayload;
    } catch {
        return null;
    }
}

export async function verifySessionFromRequest(
    request: NextRequest
): Promise<SessionPayload | null> {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    return verifySession(token);
}

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    return verifySession(token);
}

export function setSessionCookie(
    response: Response,
    token: string
): Response {
    response.headers.append(
        "Set-Cookie",
        `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
    );
    return response;
}

export function clearSessionCookie(response: Response): Response {
    response.headers.append(
        "Set-Cookie",
        `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
    );
    return response;
}

// ── Community Bypass Token ──

export async function generateAccessToken(): Promise<string> {
    return await new SignJWT({ purpose: "community-bypass" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(ACCESS_TOKEN_EXPIRY)
        .sign(getAccessTokenSecret());
}

export async function verifyAccessToken(token: string): Promise<boolean> {
    try {
        await jwtVerify(token, getAccessTokenSecret());
        return true;
    } catch {
        return false;
    }
}
