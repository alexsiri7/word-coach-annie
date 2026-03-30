import { NextResponse } from "next/server";
import { google } from "googleapis";
import crypto from "crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * GET /api/auth/google — Redirect to Google OAuth consent screen.
 * Requests openid + email + profile scopes for user login.
 */
export async function GET() {
    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;
    const redirectUri = env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
        return NextResponse.json(
            { error: "Google OAuth not configured" },
            { status: 501 }
        );
    }

    try {
        const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

        const state = crypto.randomUUID();

        const authUrl = client.generateAuthUrl({
            access_type: "offline",
            scope: [
                "openid",
                "https://www.googleapis.com/auth/userinfo.email",
                "https://www.googleapis.com/auth/userinfo.profile",
            ],
            prompt: "consent",
            state,
        });

        const response = NextResponse.redirect(authUrl);
        response.cookies.set("oauth_state", state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 600, // 10 minutes
            path: "/",
        });

        return response;
    } catch (error) {
        logger.error("GET /api/auth/google error", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
