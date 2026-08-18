import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, REFRESH_COOKIE_NAME, SESSION_MAX_AGE, REFRESH_MAX_AGE } from "@/lib/auth";
import { verifySessionTokenNode, verifyRefreshToken } from "@/lib/auth-server";
import { revokeToken } from "@/lib/token-blocklist";
import { logger } from "@/lib/logger";

async function revokeIfPresent(
    jti: string | undefined,
    userId: string | undefined,
    maxAge: number,
    label: string,
): Promise<void> {
    if (!jti || !userId) return;
    // Use maxAge as a safe upper bound for blocklist expiry.
    // Actual token exp = iat + maxAge; using now + maxAge is always >= actual exp.
    const expiresAt = new Date(Date.now() + maxAge * 1000);
    try {
        await revokeToken(jti, userId, expiresAt);
    } catch (err) {
        // Non-fatal: cookie is still cleared; revocation is best-effort
        logger.error(`[logout] Failed to revoke ${label} in blocklist:`, err);
    }
}

export async function POST(request: NextRequest) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const refreshCookie = request.cookies.get(REFRESH_COOKIE_NAME)?.value;

    if (sessionCookie) {
        const session = await verifySessionTokenNode(sessionCookie);
        await revokeIfPresent(session?.jti, session?.userId, SESSION_MAX_AGE, "session token");
    }

    if (refreshCookie) {
        const refresh = await verifyRefreshToken(refreshCookie);
        await revokeIfPresent(refresh?.jti, refresh?.userId, REFRESH_MAX_AGE, "refresh token");
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
        path: "/api/auth/",
    });
    return response;
}
