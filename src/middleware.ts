import { NextRequest, NextResponse } from "next/server";
import {
    SESSION_COOKIE_NAME,
    deriveSessionToken,
    verifySessionToken,
    isAuthEnabled,
} from "@/lib/auth";

/** Paths that never require authentication. */
const PUBLIC_PATHS = [
    "/api/health",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/google",
    "/api/auth/me",
    "/login",
];

function isPublicPath(pathname: string): boolean {
    return PUBLIC_PATHS.some(
        (p) => pathname === p || pathname.startsWith(p + "/")
    );
}

export async function middleware(request: NextRequest) {
    // No auth configured → pass through (local dev mode)
    if (!isAuthEnabled()) {
        return NextResponse.next();
    }

    const { pathname } = request.nextUrl;

    // Allow public paths through
    if (isPublicPath(pathname)) {
        return NextResponse.next();
    }

    // Check Authorization header (programmatic / MCP access via API_TOKEN)
    const apiToken = process.env.API_TOKEN;
    const authHeader = request.headers.get("authorization");
    if (authHeader && apiToken) {
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice(7)
            : null;
        if (token && token === apiToken) {
            return NextResponse.next();
        }
        // Invalid bearer token on API route → 401 immediately
        if (pathname.startsWith("/api/")) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }
    }

    // Check session cookie (browser access — JWT or legacy API_TOKEN hash)
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (sessionCookie) {
        // Try JWT verification first (Google OAuth sessions)
        const session = await verifySessionToken(sessionCookie);
        if (session) {
            // Attach userId to request headers for downstream routes
            const response = NextResponse.next();
            response.headers.set("x-user-id", session.userId);
            response.headers.set("x-user-email", session.email);
            return response;
        }

        // Fall back to legacy API_TOKEN session cookie
        if (apiToken) {
            const expected = await deriveSessionToken(apiToken);
            if (sessionCookie === expected) {
                return NextResponse.next();
            }
        }
    }

    // Not authenticated — return 401 for API, redirect for pages
    if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
}

export const config = {
    matcher: [
        /*
         * Match all paths except Next.js internals and static assets:
         * - _next/static, _next/image
         * - favicon, icons, manifest, service worker, workbox
         */
        "/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|icons/|manifest\\.json|sw\\.js|workbox-).*)",
    ],
};
