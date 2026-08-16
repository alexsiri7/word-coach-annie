import { NextRequest, NextResponse } from "next/server";
import {
    SESSION_COOKIE_NAME,
    deriveSessionToken,
} from "@/lib/auth";
import { verifySessionTokenNode as verifySessionToken } from "@/lib/auth-server";
import { env } from "@/lib/env";

/**
 * GET /api/auth/me — Return current user info.
 * Returns user data from JWT session, or anonymous for API_TOKEN sessions.
 */
export async function GET(request: NextRequest) {
    const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!cookie) {
        return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    // Try JWT session first (Google OAuth)
    const session = await verifySessionToken(cookie);
    if (session) {
        return NextResponse.json({
            authenticated: true,
            user: {
                userId: session.userId,
                email: session.email,
                name: session.name,
                picture: session.picture,
            },
        });
    }

    // Check legacy API_TOKEN session
    const apiToken = env.API_TOKEN;
    if (apiToken) {
        const expected = await deriveSessionToken(apiToken);
        if (cookie === expected) {
            return NextResponse.json({
                authenticated: true,
                user: null,
            });
        }
    }

    return NextResponse.json({ authenticated: false }, { status: 401 });
}
