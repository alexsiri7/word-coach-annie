import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, deriveSessionToken } from "@/lib/auth";

/** Paths that never require authentication. */
const PUBLIC_PATHS = ["/api/health", "/api/auth/login", "/login"];

function isPublicPath(pathname: string): boolean {
    return PUBLIC_PATHS.some(
        (p) => pathname === p || pathname.startsWith(p + "/")
    );
}

export async function middleware(request: NextRequest) {
    const apiToken = process.env.API_TOKEN;

    // No API_TOKEN configured → auth disabled (local dev mode)
    if (!apiToken) {
        return NextResponse.next();
    }

    const { pathname } = request.nextUrl;

    // Allow public paths through
    if (isPublicPath(pathname)) {
        return NextResponse.next();
    }

    // Check Authorization header (programmatic / MCP access)
    const authHeader = request.headers.get("authorization");
    if (authHeader) {
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice(7)
            : null;
        if (token && token === apiToken) {
            return NextResponse.next();
        }
        // Invalid token
        if (pathname.startsWith("/api/")) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }
    }

    // Check session cookie (browser access)
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (sessionCookie) {
        const expected = await deriveSessionToken(apiToken);
        if (sessionCookie === expected) {
            return NextResponse.next();
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
