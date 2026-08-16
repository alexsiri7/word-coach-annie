import { type NextRequest, NextResponse } from "next/server";
import {
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE,
    REFRESH_COOKIE_NAME,
    verifySessionToken,
    verifyRefreshToken,
    createSessionToken,
} from "@/lib/auth";
import { logger } from "@/lib/logger";

/**
 * POST /api/auth/refresh — Silently renew an active session.
 *
 * Two paths:
 *   1. Active session: if the session cookie is still valid, mint a new session JWT
 *      (45-min frontend timer catches this before expiry).
 *   2. Cold return: if the session cookie is missing/expired but the long-lived
 *      refresh cookie is valid, mint a new session JWT (covers tab-reopens after
 *      >1 hour, sleep/wake cycles, server restarts, etc.).
 *
 * Both paths run in the Node.js runtime (not Edge), which means the revocation
 * blocklist IS consulted — explicitly logged-out tokens cannot be renewed.
 * See: src/lib/auth.ts — the 1-hour SESSION_MAX_AGE is a deliberate compensating
 * control for the Edge's inability to consult the blocklist; renewing through this
 * Node.js route preserves the revocation guarantee.
 *
 * The refresh cookie (annie_refresh) is scoped to /api/auth/refresh, so it is
 * only sent on calls to this endpoint — reducing its exposure surface.
 *
 * Returns:
 *   200 { ok: true }  — new session cookie set; refresh cookie preserved
 *   401 { error }     — both cookies missing/invalid/revoked; caller should redirect to login
 */
export async function POST(request: NextRequest) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const refreshCookie = request.cookies.get(REFRESH_COOKIE_NAME)?.value;

    // Path 1: existing session still valid — re-issue it to reset the 1h clock.
    if (sessionCookie) {
        const session = await verifySessionToken(sessionCookie);
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

    // Path 2: session expired (or missing) — try the long-lived refresh token.
    // verifyRefreshToken checks the blocklist, so revoked tokens (logout) are rejected.
    if (refreshCookie) {
        const refresh = await verifyRefreshToken(refreshCookie);
        if (refresh) {
            try {
                const freshJwt = await createSessionToken({
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
                return response;
            } catch (err) {
                logger.error("POST /api/auth/refresh: failed to mint new session from refresh token", err);
                return NextResponse.json({ error: "Internal error" }, { status: 500 });
            }
        }
    }

    // Both cookies missing or revoked — the user must log in again.
    return NextResponse.json({ error: "Session expired or revoked" }, { status: 401 });
}
