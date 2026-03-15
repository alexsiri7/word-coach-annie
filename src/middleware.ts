import { NextRequest, NextResponse } from "next/server";
import {
    SESSION_COOKIE_NAME,
    deriveSessionToken,
    verifySessionToken,
    isAuthEnabled,
} from "@/lib/auth";
import { generateRequestId, logRequest } from "@/lib/logger";

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
    const startTime = Date.now();
    const requestId =
        request.headers.get("x-request-id") || generateRequestId();
    const { pathname } = request.nextUrl;

    function finalizeResponse(
        response: NextResponse,
        userId?: string
    ): NextResponse {
        response.headers.set("x-request-id", requestId);

        // Only log API requests to avoid noise from static assets
        if (pathname.startsWith("/api/")) {
            logRequest({
                request_id: requestId,
                method: request.method,
                path: pathname,
                status: response.status,
                duration_ms: Date.now() - startTime,
                user_id: userId,
            });
        }

        return response;
    }

    // No auth configured → pass through (local dev mode)
    if (!isAuthEnabled()) {
        const response = NextResponse.next({
            request: {
                headers: addRequestIdHeader(request.headers, requestId),
            },
        });
        return finalizeResponse(response);
    }

    // Allow public paths through
    if (isPublicPath(pathname)) {
        const response = NextResponse.next({
            request: {
                headers: addRequestIdHeader(request.headers, requestId),
            },
        });
        return finalizeResponse(response);
    }

    // Check Authorization header (programmatic / MCP access via API_TOKEN)
    const apiToken = process.env.API_TOKEN;
    const authHeader = request.headers.get("authorization");
    if (authHeader && apiToken) {
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice(7)
            : null;
        if (token && token === apiToken) {
            const response = NextResponse.next({
                request: {
                    headers: addRequestIdHeader(
                        request.headers,
                        requestId
                    ),
                },
            });
            return finalizeResponse(response);
        }
        // Invalid bearer token on API route → 401 immediately
        if (pathname.startsWith("/api/")) {
            return finalizeResponse(
                NextResponse.json(
                    { error: "Unauthorized" },
                    { status: 401 }
                )
            );
        }
    }

    // Check session cookie (browser access — JWT or legacy API_TOKEN hash)
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (sessionCookie) {
        // Try JWT verification first (Google OAuth sessions)
        const session = await verifySessionToken(sessionCookie);
        if (session) {
            // Forward userId and requestId to route handlers via request headers
            const requestHeaders = new Headers(request.headers);
            requestHeaders.set("x-user-id", session.userId);
            requestHeaders.set("x-user-email", session.email);
            requestHeaders.set("x-request-id", requestId);
            const response = NextResponse.next({
                request: { headers: requestHeaders },
            });
            return finalizeResponse(response, session.userId);
        }

        // Fall back to legacy API_TOKEN session cookie
        if (apiToken) {
            const expected = await deriveSessionToken(apiToken);
            if (sessionCookie === expected) {
                const response = NextResponse.next({
                    request: {
                        headers: addRequestIdHeader(
                            request.headers,
                            requestId
                        ),
                    },
                });
                return finalizeResponse(response);
            }
        }
    }

    // Not authenticated — return 401 for API, redirect for pages
    if (pathname.startsWith("/api/")) {
        return finalizeResponse(
            NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        );
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return finalizeResponse(NextResponse.redirect(loginUrl));
}

/** Create a copy of the request headers with x-request-id added. */
function addRequestIdHeader(
    headers: Headers,
    requestId: string
): Headers {
    const copy = new Headers(headers);
    copy.set("x-request-id", requestId);
    return copy;
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
