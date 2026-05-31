import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE, verifySessionToken } from "@/lib/auth";
import { revokeToken } from "@/lib/token-blocklist";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (sessionCookie) {
        const session = await verifySessionToken(sessionCookie);
        if (session?.jti) {
            // Use SESSION_MAX_AGE as a safe upper bound for blocklist expiry.
            // Actual token exp = iat + SESSION_MAX_AGE; using now + SESSION_MAX_AGE is always >= actual exp.
            const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
            try {
                await revokeToken(session.jti, session.userId, expiresAt);
            } catch (err) {
                // Non-fatal: cookie is still cleared; revocation is best-effort
                logger.error("[logout] Failed to revoke token in blocklist:", err);
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
    return response;
}
