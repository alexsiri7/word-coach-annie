import { NextResponse } from "next/server";
import { google } from "googleapis";

/**
 * GET /api/auth/google — Redirect to Google OAuth consent screen.
 * Requests openid + email + profile scopes for user login.
 */
export async function GET() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

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
