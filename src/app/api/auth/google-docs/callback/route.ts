import { NextRequest, NextResponse } from "next/server";
import { GoogleAuthController } from "@/lib/controllers/google-auth";
import { getCurrentUserId } from "@/lib/api-auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { resolveJwtSecret, safeEqual } from "@/lib/auth";
import crypto from "crypto";

/**
 * GET /api/auth/google-docs/callback — Handle Google OAuth callback for Docs/Drive scopes.
 * Exchanges auth code for tokens, stores GoogleCredential, redirects to /settings.
 */
export async function GET(request: NextRequest) {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
        return NextResponse.json({ error: "Google OAuth not configured" }, { status: 501 });
    }
    const { searchParams } = new URL(request.url);
    const origin = new URL(env.GOOGLE_REDIRECT_URI).origin;

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
        // Verify HMAC binding: state = "{nonce}.{sig}" where sig is the first 16 hex
        // chars of HMAC-SHA256(nonce, jwtSecret). Both sides must use the same format.
        const dotIdx = state.indexOf(".");
        if (dotIdx === -1) {
            return NextResponse.redirect(new URL("/settings?google_docs_error=invalid_state", origin));
        }
        const nonce = state.slice(0, dotIdx);
        const sig = state.slice(dotIdx + 1);
        const jwtSecret = resolveJwtSecret();
        const expectedSig = crypto
            .createHmac("sha256", jwtSecret)
            .update(nonce)
            .digest("hex")
            .slice(0, 16); // 16 hex chars = 64-bit HMAC — sufficient given UUID nonce + 10-min cookie window
        // Use constant-time comparison to prevent timing side-channel on sig bytes
        if (!safeEqual(sig, expectedSig)) {
            logger.warn("Google Docs OAuth HMAC state verification failed — possible CSRF or replay attempt");
            return NextResponse.redirect(new URL("/settings?google_docs_error=invalid_state", origin));
        }

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
