import { NextResponse } from "next/server";
import { google } from "googleapis";
import { env } from "@/lib/env";

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

    const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const authUrl = client.generateAuthUrl({
        access_type: "offline",
        scope: [
            "openid",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
        ],
        prompt: "consent",
    });

    return NextResponse.redirect(authUrl);
}
