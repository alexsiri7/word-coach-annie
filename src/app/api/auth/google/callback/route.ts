import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/db";
import {
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE,
    createSessionToken,
} from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * GET /api/auth/google/callback — Handle Google OAuth callback.
 * Exchanges auth code for tokens, fetches user info, upserts User,
 * and sets a JWT session cookie.
 */
export async function GET(request: NextRequest) {
    const code = request.nextUrl.searchParams.get("code");
    if (!code) {
        return NextResponse.json(
            { error: "Missing authorization code" },
            { status: 400 }
        );
    }

    // Verify CSRF state parameter
    const stateParam = request.nextUrl.searchParams.get("state");
    const stateCookie = request.cookies.get("oauth_state")?.value;
    if (!stateParam || !stateCookie || stateParam !== stateCookie) {
        const redirectUri = env.GOOGLE_REDIRECT_URI;
        const baseUrl = redirectUri
            ? new URL(redirectUri).origin
            : request.nextUrl.origin;
        return NextResponse.redirect(
            new URL("/login?error=invalid_state", baseUrl)
        );
    }

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

        // Exchange code for tokens — catch invalid_grant separately
        let tokens;
        try {
            const result = await client.getToken(code);
            tokens = result.tokens;
        } catch {
            const baseUrl = new URL(redirectUri).origin;
            return NextResponse.redirect(
                new URL("/login?error=invalid_code", baseUrl)
            );
        }
        client.setCredentials(tokens);

        // Fetch user info from Google
        const oauth2 = google.oauth2({ version: "v2", auth: client });
        const { data: userInfo } = await oauth2.userinfo.get();

        if (!userInfo.email || !userInfo.id) {
            return NextResponse.json(
                { error: "Could not retrieve user info from Google" },
                { status: 400 }
            );
        }

        // Enforce invite-only allowlist (when configured)
        if (env.ALLOWED_EMAILS) {
            const allowed = env.ALLOWED_EMAILS.split(",").map((e) =>
                e.trim().toLowerCase()
            );
            if (!allowed.includes(userInfo.email.toLowerCase())) {
                const baseUrl = new URL(redirectUri).origin;
                return NextResponse.redirect(
                    new URL("/login?error=invite_only", baseUrl)
                );
            }
        }

        // Upsert user in database
        const user = await prisma.user.upsert({
            where: { googleId: userInfo.id },
            update: {
                email: userInfo.email,
                name: userInfo.name || "",
                picture: userInfo.picture || null,
            },
            create: {
                email: userInfo.email,
                googleId: userInfo.id,
                name: userInfo.name || "",
                picture: userInfo.picture || null,
            },
        });

        // Create JWT session
        const jwt = await createSessionToken({
            userId: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture || undefined,
        });

        // Redirect to the original page (if set) or home
        // Use GOOGLE_REDIRECT_URI origin to avoid Docker container hostname in redirect
        const baseUrl = new URL(redirectUri).origin;
        const redirectTo = request.cookies.get("oauth_redirect")?.value;
        const destination = redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
            ? redirectTo
            : "/";
        const response = NextResponse.redirect(new URL(destination, baseUrl));
        // Clear the OAuth state and redirect cookies
        response.cookies.set("oauth_redirect", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 0,
            path: "/",
        });
        response.cookies.set("oauth_state", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 0,
            path: "/",
        });
        response.cookies.set(SESSION_COOKIE_NAME, jwt, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax", // lax required for OAuth redirect
            maxAge: SESSION_MAX_AGE,
            path: "/",
        });

        return response;
    } catch (error) {
        logger.error("GET /api/auth/google/callback error", error);
        // Redirect to login with generic error rather than exposing details
        const baseUrl = redirectUri
            ? new URL(redirectUri).origin
            : request.nextUrl.origin;
        return NextResponse.redirect(
            new URL("/login?error=callback_failed", baseUrl)
        );
    }
}
