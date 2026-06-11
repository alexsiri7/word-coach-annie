import { NextRequest, NextResponse } from "next/server";
import { GoogleAuthController } from "@/lib/controllers/google-auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { resolveJwtSecret } from "@/lib/auth";
import crypto from "crypto";

/**
 * GET /api/auth/google-docs — Redirect to Google OAuth for Docs/Drive scopes.
 * Separate from /api/auth/google (login) — this grants document access only.
 */
export async function GET(_request: NextRequest) {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
        return NextResponse.json(
            { error: "Google OAuth not configured" },
            { status: 501 }
        );
    }

    try {
        const baseUrl = new URL(env.GOOGLE_REDIRECT_URI).origin;
        const redirectUri = `${baseUrl}/api/auth/google-docs/callback`;

        const nonce = crypto.randomUUID();
        const jwtSecret = resolveJwtSecret();
        // State = "nonce.sig" where sig is the first 16 hex chars of HMAC-SHA256(nonce, jwtSecret).
        // 16 hex chars = 64-bit HMAC — sufficient given UUID nonce + 10-min cookie window.
        const sig = crypto
            .createHmac("sha256", jwtSecret)
            .update(nonce)
            .digest("hex")
            .slice(0, 16);
        const state = `${nonce}.${sig}`;
        const authUrl = GoogleAuthController.getAuthUrl(redirectUri) + `&state=${state}`;

        const response = NextResponse.redirect(authUrl);
        response.cookies.set("google_docs_oauth_state", state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 600,
            path: "/",
        });

        return response;
    } catch (error) {
        logger.error("GET /api/auth/google-docs error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
