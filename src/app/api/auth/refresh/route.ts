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
    getActiveUser,
} from "@/lib/auth-server";
import { claimToken } from "@/lib/token-blocklist";
import { logger } from "@/lib/logger";

const IS_PROD = process.env.NODE_ENV === "production";

function setSessionCookie(response: NextResponse, jwt: string): void {
    response.cookies.set(SESSION_COOKIE_NAME, jwt, {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE,
        path: "/",
    });
}

function setRefreshCookie(response: NextResponse, jwt: string): void {
    response.cookies.set(REFRESH_COOKIE_NAME, jwt, {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: "lax",
        maxAge: REFRESH_MAX_AGE,
        path: "/api/auth/",
    });
}

function unauthorized(): NextResponse {
    return NextResponse.json({ error: "Session expired or revoked" }, { status: 401 });
}

export async function POST(request: NextRequest) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const refreshCookie = request.cookies.get(REFRESH_COOKIE_NAME)?.value;

    // Path 1: existing session still valid — re-issue it to reset the 1h clock.
    // Every path re-issues from the User row, so deleted or de-invited users are cut off.
    if (sessionCookie) {
        const session = await verifySessionTokenNode(sessionCookie);
        if (session) {
            try {
                const user = await getActiveUser(session.userId);
                if (!user) return unauthorized();
                const freshJwt = await createSessionToken(user);
                const response = NextResponse.json({ ok: true });
                setSessionCookie(response, freshJwt);
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
                const user = await getActiveUser(refresh.userId);
                if (!user) return unauthorized();
                // Rotate the refresh token: atomically claim the old jti before issuing a new one,
                // so only one of two concurrent uses of the same token succeeds.
                if (refresh.jti) {
                    const expiresAt = new Date(Date.now() + REFRESH_MAX_AGE * 1000);
                    if (!(await claimToken(refresh.jti, refresh.userId, expiresAt))) {
                        logger.warn("POST /api/auth/refresh: refresh token reuse detected", { userId: refresh.userId });
                        return unauthorized();
                    }
                }
                const freshJwt = await createSessionToken(user);
                const freshRefreshJwt = await createRefreshToken(user);
                const response = NextResponse.json({ ok: true });
                setSessionCookie(response, freshJwt);
                setRefreshCookie(response, freshRefreshJwt);
                return response;
            } catch (err) {
                logger.error("POST /api/auth/refresh: failed to mint new session from refresh token", err);
                return NextResponse.json({ error: "Internal error" }, { status: 500 });
            }
        }
    }

    return unauthorized();
}
