import { type NextRequest, NextResponse } from "next/server";
import {
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE,
    REFRESH_COOKIE_NAME,
    REFRESH_MAX_AGE,
} from "@/lib/auth";
import {
    verifySessionTokenNode,
    verifyRefreshToken,
    createSessionToken,
    createRefreshToken,
} from "@/lib/auth-server";
import { revokeToken } from "@/lib/token-blocklist";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const refreshCookie = request.cookies.get(REFRESH_COOKIE_NAME)?.value;

    // Path 1: existing session still valid — re-issue it to reset the 1h clock.
    if (sessionCookie) {
        const session = await verifySessionTokenNode(sessionCookie);
        if (session) {
            try {
                const freshJwt = await createSessionToken({
                    userId: session.userId,
                    email: session.email,
                    name: session.name,
                    picture: session.picture,
                });
                const response = NextResponse.json({ ok: true });
                response.cookies.set(SESSION_COOKIE_NAME, freshJwt, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === "production",
                    sameSite: "lax",
                    maxAge: SESSION_MAX_AGE,
                    path: "/",
                });
                return response;
            } catch (err) {
                logger.error("POST /api/auth/refresh: failed to mint new session from active session", err);
                return NextResponse.json({ error: "Internal error" }, { status: 500 });
            }
        }
    }

    // Path 2: session expired — try the long-lived refresh token (blocklist checked).
    if (refreshCookie) {
        const refresh = await verifyRefreshToken(refreshCookie);
        if (refresh) {
            try {
                // Rotate the refresh token: revoke old jti before issuing new one.
                // This limits leaked refresh token exposure to ~45 min (next legitimate use invalidates it).
                if (refresh.jti) {
                    const expiresAt = new Date(Date.now() + REFRESH_MAX_AGE * 1000);
                    await revokeToken(refresh.jti, refresh.userId, expiresAt);
                }
                const freshJwt = await createSessionToken({
                    userId: refresh.userId,
                    email: refresh.email,
                    name: refresh.name,
                    picture: refresh.picture,
                });
                const freshRefreshJwt = await createRefreshToken({
                    userId: refresh.userId,
                    email: refresh.email,
                    name: refresh.name,
                    picture: refresh.picture,
                });
                const response = NextResponse.json({ ok: true });
                response.cookies.set(SESSION_COOKIE_NAME, freshJwt, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === "production",
                    sameSite: "lax",
                    maxAge: SESSION_MAX_AGE,
                    path: "/",
                });
                response.cookies.set(REFRESH_COOKIE_NAME, freshRefreshJwt, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === "production",
                    sameSite: "lax",
                    maxAge: REFRESH_MAX_AGE,
                    path: "/api/auth/",
                });
                return response;
            } catch (err) {
                logger.error("POST /api/auth/refresh: failed to mint new session from refresh token", err);
                return NextResponse.json({ error: "Internal error" }, { status: 500 });
            }
        }
    }

    return NextResponse.json({ error: "Session expired or revoked" }, { status: 401 });
}
