import { type NextRequest, NextResponse } from "next/server";
import {
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE,
    REFRESH_COOKIE_NAME,
    REFRESH_MAX_AGE,
    verifySessionToken,
    verifyRefreshToken,
} from "@/lib/auth";
import { revokeToken } from "@/lib/token-blocklist";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const refreshCookie = request.cookies.get(REFRESH_COOKIE_NAME)?.value;

    // Revoke the session token if present and valid
    if (sessionCookie) {
        const session = await verifySessionToken(sessionCookie);
        if (session?.jti) {
            // Use SESSION_MAX_AGE as a safe upper bound for blocklist expiry.
            const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
            try {
                await revokeToken(session.jti, session.userId, expiresAt);
            } catch (err) {
                // Non-fatal: cookie is still cleared; revocation is best-effort
                logger.error("[logout] Failed to revoke session token:", err);
            }
        }
    }

    // Revoke the refresh token if present and valid.
    // Use REFRESH_MAX_AGE so the blocklist entry outlives the token's full lifetime.
    if (refreshCookie) {
        const refresh = await verifyRefreshToken(refreshCookie);
        if (refresh?.jti) {
            const expiresAt = new Date(Date.now() + REFRESH_MAX_AGE * 1000);
            try {
                await revokeToken(refresh.jti, refresh.userId, expiresAt);
            } catch (err) {
                logger.error("[logout] Failed to revoke refresh token:", err);
            }
        }
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 0,
        path: "/",
    });
    response.cookies.set(REFRESH_COOKIE_NAME, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/api/auth/refresh",
    });
    return response;
}
