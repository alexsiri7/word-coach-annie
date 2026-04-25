import { NextRequest, NextResponse } from "next/server";
import { GoogleAuthController } from "@/lib/controllers/google-auth";
import { getCurrentUserId } from "@/lib/api-auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * GET /api/auth/google-docs/callback — Handle Google OAuth callback for Docs/Drive scopes.
 * Exchanges auth code for tokens, stores GoogleCredential, redirects to /settings.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const origin = new URL(env.GOOGLE_REDIRECT_URI || request.url).origin;

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const stateCookie = request.cookies.get("google_docs_oauth_state")?.value;

    if (!code) {
        return NextResponse.redirect(new URL("/settings?google_docs_error=missing_code", origin));
    }

    if (!state || !stateCookie || state !== stateCookie) {
        return NextResponse.redirect(new URL("/settings?google_docs_error=invalid_state", origin));
    }

    try {
        const redirectUri = `${origin}/api/auth/google-docs/callback`;
        const userId = getCurrentUserId(request);
        await GoogleAuthController.handleCallback(code, redirectUri, userId);

        const response = NextResponse.redirect(new URL("/settings?google_docs=connected", origin));
        response.cookies.set("google_docs_oauth_state", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 0,
            path: "/",
        });
        return response;
    } catch (error) {
        logger.error("GET /api/auth/google-docs/callback error", error);
        return NextResponse.redirect(new URL("/settings?google_docs_error=callback_failed", origin));
    }
}
