import { NextRequest, NextResponse } from "next/server";
import { GoogleAuthController } from "@/lib/controllers/google-auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import crypto from "crypto";

/**
 * GET /api/auth/google-docs — Redirect to Google OAuth for Docs/Drive scopes.
 * Separate from /api/auth/google (login) — this grants document access only.
 */
export async function GET(request: NextRequest) {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        return NextResponse.json(
            { error: "Google OAuth not configured" },
            { status: 501 }
        );
    }

    try {
        const proto = request.headers.get("x-forwarded-proto") || "https";
        const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
        const baseUrl = `${proto}://${host}`;
        const redirectUri = `${baseUrl}/api/auth/google-docs/callback`;

        const state = crypto.randomUUID();
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
