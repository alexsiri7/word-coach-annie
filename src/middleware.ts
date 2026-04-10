import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
    SESSION_COOKIE_NAME,
    deriveSessionToken,
    verifySessionToken,
    isAuthEnabled,
} from "@/lib/auth";
import { verifyMcpToken } from "@/lib/oauth-tokens";
import { env } from "@/lib/env";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/** Paths that never require authentication. */
const PUBLIC_PATHS = [
    "/api/health",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/google",
    "/api/auth/me",
    "/login",
    "/privacy",
    "/terms",
    "/.well-known/oauth-authorization-server",
    "/oauth/register",
    "/oauth/token",
    "/version.json",
];

function isPublicPath(pathname: string): boolean {
    return PUBLIC_PATHS.some(
        (p) => pathname === p || pathname.startsWith(p + "/")
    );
}

function makeRateLimitResponse(
    config: { limit: number; windowMs: number },
    retryAfterMs: number,
    resetMs: number
): NextResponse {
    const retryAfterSec = Math.ceil((retryAfterMs ?? 1000) / 1000);
    return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
            status: 429,
            headers: {
                "Retry-After": String(retryAfterSec),
                "X-RateLimit-Limit": String(config.limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": String(Math.ceil(resetMs / 1000)),
            },
        }
    );
}

/**
 * Apply per-user rate limiting on API routes.
 * - Chat: 30 req/min
 * - Read (GET): 120 req/min
 * - Write (POST/PATCH/DELETE): 60 req/min
 * - Project creation (POST /api/projects): 100/hour
 * Returns a 429 response if any limit is exceeded, or null if allowed.
 */
function applyRateLimit(
    request: NextRequest,
    userKey: string
): NextResponse | null {
    const pathname = request.nextUrl.pathname;
    if (!pathname.startsWith("/api/")) return null;

    // Allow E2E / CI environments to bypass rate limiting
    if (process.env.DISABLE_RATE_LIMIT === "true") return null;

    const method = request.method;

    // Chat endpoint has its own dedicated limit
    const isChatRoute =
        pathname === "/api/chat" || pathname.startsWith("/api/chat/");
    if (isChatRoute) {
        const result = checkRateLimit(`chat:${userKey}`, RATE_LIMITS.chat);
        if (!result.allowed) {
            return makeRateLimitResponse(
                RATE_LIMITS.chat,
                result.retryAfterMs!,
                result.resetMs
            );
        }
        return null;
    }

    // Project creation: POST /api/projects (not /api/projects/:id subpaths)
    const isProjectCreate = method === "POST" && pathname === "/api/projects";
    if (isProjectCreate) {
        const result = checkRateLimit(
            `projectCreate:${userKey}`,
            RATE_LIMITS.projectCreate
        );
        if (!result.allowed) {
            return makeRateLimitResponse(
                RATE_LIMITS.projectCreate,
                result.retryAfterMs!,
                result.resetMs
            );
        }
        return null;
    }

    // Feedback submission: POST /api/feedback
    const isFeedback = method === "POST" && pathname === "/api/feedback";
    if (isFeedback) {
        const result = checkRateLimit(
            `feedback:${userKey}`,
            RATE_LIMITS.feedback
        );
        if (!result.allowed) {
            return makeRateLimitResponse(
                RATE_LIMITS.feedback,
                result.retryAfterMs!,
                result.resetMs
            );
        }
        return null;
    }

    // Read vs write rate limit
    const isRead = method === "GET" || method === "HEAD";
    const config = isRead ? RATE_LIMITS.read : RATE_LIMITS.write;
    const prefix = isRead ? "read" : "write";
    const result = checkRateLimit(`${prefix}:${userKey}`, config);

    if (!result.allowed) {
        return makeRateLimitResponse(
            config,
            result.retryAfterMs!,
            result.resetMs
        );
    }

    return null;
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

    // Check Authorization header (programmatic / MCP access)
    const apiToken = env.API_TOKEN;
    const authHeader = request.headers.get("authorization");
    if (authHeader) {
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice(7)
            : null;

        // 1. Check static API_TOKEN
        if (token && apiToken && token === apiToken) {
            const rateLimited = applyRateLimit(request, "apitoken");
            if (rateLimited) return rateLimited;
            return NextResponse.next();
        }

        // 2. Check MCP OAuth access token (JWT with type: "mcp_access")
        if (token) {
            const mcpSession = await verifyMcpToken(token, "mcp_access");
            if (mcpSession) {
                const rateLimited = applyRateLimit(request, mcpSession.userId);
                if (rateLimited) return rateLimited;

                Sentry.setUser({
                    id: mcpSession.userId,
                    email: mcpSession.email,
                });

                const requestHeaders = new Headers(request.headers);
                requestHeaders.set("x-user-id", mcpSession.userId);
                requestHeaders.set("x-user-email", mcpSession.email);
                return NextResponse.next({
                    request: { headers: requestHeaders },
                });
            }
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
            // Rate limit by authenticated user ID
            const rateLimited = applyRateLimit(request, session.userId);
            if (rateLimited) return rateLimited;

            // Set Sentry user context for error attribution
            Sentry.setUser({
                id: session.userId,
                email: session.email,
            });

            // Forward userId to route handlers via request headers
            const requestHeaders = new Headers(request.headers);
            requestHeaders.set("x-user-id", session.userId);
            requestHeaders.set("x-user-email", session.email);
            return NextResponse.next({
                request: { headers: requestHeaders },
            });
        }

        // Fall back to legacy API_TOKEN session cookie
        if (apiToken) {
            const expected = await deriveSessionToken(apiToken);
            if (sessionCookie === expected) {
                // Rate limit legacy sessions by token
                const rateLimited = applyRateLimit(request, "apitoken");
                if (rateLimited) return rateLimited;
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
