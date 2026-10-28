import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { resetRateLimitStore } from "@/lib/rate-limit";

// Mock Sentry
vi.mock("@sentry/nextjs", () => ({
    setUser: vi.fn(),
    captureException: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";

// Mock oauth-tokens module
vi.mock("@/lib/oauth-tokens", () => ({
    verifyMcpToken: vi.fn(async () => null),
}));

import { verifyMcpToken } from "@/lib/oauth-tokens";

// Mock auth module; the legacy API_TOKEN cookie helpers stay real so their verification is exercised end to end.
vi.mock("@/lib/auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/auth")>();
    return {
        SESSION_COOKIE_NAME: "annie_session",
        SESSION_MAX_AGE: actual.SESSION_MAX_AGE,
        createLegacySessionCookie: actual.createLegacySessionCookie,
        verifyLegacySessionCookie: actual.verifyLegacySessionCookie,
        verifySessionToken: vi.fn(async () => null),
        isAuthEnabled: vi.fn(() => false),
        safeEqual: (a: string, b: string) => a === b,
    };
});

import { isAuthEnabled, createLegacySessionCookie, verifySessionToken, SESSION_MAX_AGE } from "@/lib/auth";

function createRequest(path: string, options?: {
    method?: string;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
}): NextRequest {
    const url = `http://localhost:3000${path}`;
    const req = new NextRequest(url, {
        method: options?.method ?? "GET",
        headers: options?.headers,
    });
    if (options?.cookies) {
        for (const [name, value] of Object.entries(options.cookies)) {
            req.cookies.set(name, value);
        }
    }
    return req;
}

describe("middleware", () => {
    let origApiToken: string | undefined;

    beforeEach(() => {
        origApiToken = process.env.API_TOKEN;
        vi.clearAllMocks();
        resetRateLimitStore();
    });

    afterEach(() => {
        if (origApiToken !== undefined) process.env.API_TOKEN = origApiToken;
        else delete process.env.API_TOKEN;
    });

    it("passes through when auth is not enabled", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(false);
        const req = createRequest("/api/projects");
        const res = await middleware(req);
        expect(res.status).toBe(200); // NextResponse.next() returns 200
        const csp = res.headers.get("Content-Security-Policy");
        expect(csp).toBeTruthy();
        expect(csp).toContain("script-src");
        // Core security guarantee: no unsafe-inline in script-src (style-src retains it intentionally)
        expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    });

    it("allows public paths when auth is enabled", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        const req = createRequest("/api/health");
        const res = await middleware(req);
        expect(res.status).toBe(200);
    });

    it("allows the calendar feed without a session (token in the URL is the credential)", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        const req = createRequest("/api/calendar/opportunities/some-token.ics");
        const res = await middleware(req);
        expect(res.status).toBe(200);
    });

    describe("/api/metrics", () => {
        beforeEach(() => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            process.env.API_TOKEN = "my-token";
        });

        afterEach(() => {
            vi.mocked(verifySessionToken).mockResolvedValue(null);
            vi.mocked(verifyMcpToken).mockResolvedValue(null);
        });

        it("rejects an unauthenticated request", async () => {
            const res = await middleware(createRequest("/api/metrics"));
            expect(res.status).toBe(401);
        });

        it("allows the API_TOKEN bearer", async () => {
            const res = await middleware(createRequest("/api/metrics", {
                headers: { authorization: "Bearer my-token" },
            }));
            expect(res.status).toBe(200);
        });

        it("rejects a user session cookie", async () => {
            vi.mocked(verifySessionToken).mockResolvedValue({
                userId: "user-123",
                email: "test@example.com",
                name: "Test",
            });
            const res = await middleware(createRequest("/api/metrics", {
                cookies: { annie_session: "valid-jwt-token" },
            }));
            expect(res.status).toBe(401);
        });

        it("rejects an MCP access token", async () => {
            vi.mocked(verifyMcpToken).mockResolvedValue({
                userId: "mcp-user",
                email: "mcp@example.com",
                clientId: "test-client",
                jti: "mcp-jti-1",
                exp: Math.floor(Date.now() / 1000) + 3600,
            });
            const res = await middleware(createRequest("/api/metrics", {
                headers: { authorization: "Bearer mcp-token" },
            }));
            expect(res.status).toBe(401);
        });
    });

    it("allows /api/auth/login path", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        const req = createRequest("/api/auth/login");
        const res = await middleware(req);
        expect(res.status).toBe(200);
    });

    it("allows /api/auth/refresh without a session cookie (endpoint handles auth itself)", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        const req = createRequest("/api/auth/refresh");
        const res = await middleware(req);
        // Public path — middleware passes through; the route handler returns 401 for
        // missing/revoked cookies (tested in auth-refresh-route.test.ts).
        expect(res.status).toBe(200);
    });

    it("allows /login path", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        const req = createRequest("/login");
        const res = await middleware(req);
        expect(res.status).toBe(200);
    });

    it("allows valid Bearer token on API routes", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        process.env.API_TOKEN = "valid-token";
        const req = createRequest("/api/projects", {
            headers: { authorization: "Bearer valid-token" },
        });
        const res = await middleware(req);
        expect(res.status).toBe(200);
    });

    it("rejects invalid Bearer token on API routes", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        process.env.API_TOKEN = "valid-token";
        const req = createRequest("/api/projects", {
            headers: { authorization: "Bearer wrong-token" },
        });
        const res = await middleware(req);
        expect(res.status).toBe(401);
    });

    it("allows valid JWT session cookie", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        vi.mocked(verifySessionToken).mockResolvedValue({
            userId: "user-123",
            email: "test@example.com",
            name: "Test",
        });
        const req = createRequest("/api/projects", {
            cookies: { annie_session: "valid-jwt-token" },
        });
        const res = await middleware(req);
        expect(res.status).toBe(200);
        expect(res.headers.get("x-middleware-request-x-user-id")).toBe("user-123");
    });

    describe("legacy API_TOKEN session cookie", () => {
        const legacyRequest = (cookie: string) =>
            createRequest("/api/projects", { cookies: { annie_session: cookie } });

        beforeEach(() => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifySessionToken).mockResolvedValue(null);
            process.env.API_TOKEN = "my-token";
        });

        it("accepts a freshly issued cookie", async () => {
            const res = await middleware(legacyRequest(await createLegacySessionCookie("my-token")));
            expect(res.status).toBe(200);
        });

        it("rejects a cookie older than SESSION_MAX_AGE", async () => {
            const issued = Date.now() - (SESSION_MAX_AGE + 60) * 1000;
            const res = await middleware(legacyRequest(await createLegacySessionCookie("my-token", issued)));
            expect(res.status).toBe(401);
        });

        it("rejects a tampered cookie", async () => {
            const cookie = await createLegacySessionCookie("my-token");
            const tampered = cookie.slice(0, -1) + (cookie.endsWith("0") ? "1" : "0");
            const res = await middleware(legacyRequest(tampered));
            expect(res.status).toBe(401);
        });

        it("rejects a cookie issued before API_TOKEN was rotated", async () => {
            const res = await middleware(legacyRequest(await createLegacySessionCookie("previous-token")));
            expect(res.status).toBe(401);
        });

        it("rejects the old deterministic session value", async () => {
            const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("annie-session:my-token"));
            const legacy = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
            const res = await middleware(legacyRequest(legacy));
            expect(res.status).toBe(401);
        });
    });

    it("returns 401 for unauthenticated API requests", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        const req = createRequest("/api/projects");
        const res = await middleware(req);
        expect(res.status).toBe(401);
    });

    it("redirects unauthenticated page requests to login", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        const req = createRequest("/dashboard");
        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toContain("/login");
        expect(res.headers.get("location")).toContain("from=%2Fdashboard");
    });

    it("redirects unauthenticated / to /landing", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        const req = createRequest("/");
        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toContain("/landing");
    });

    it("does not include 'from' param in root redirect", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        const req = createRequest("/");
        const res = await middleware(req);
        const location = res.headers.get("location") ?? "";
        expect(location).not.toContain("from=");
    });

    it("allows /landing path without auth", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        const req = createRequest("/landing");
        const res = await middleware(req);
        expect(res.status).toBe(200);
    });

    it("sets Sentry user with id only on JWT session path (no email)", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        vi.mocked(verifySessionToken).mockResolvedValue({
            userId: "sentry-user",
            email: "sentry@example.com",
            name: "Test",
        });
        const req = createRequest("/api/projects", {
            cookies: { annie_session: "valid-jwt-token" },
        });
        await middleware(req);
        expect(Sentry.setUser).toHaveBeenCalledWith({ id: "sentry-user" });
        expect(Sentry.setUser).not.toHaveBeenCalledWith(
            expect.objectContaining({ email: expect.any(String) })
        );
    });

    it("sets Sentry user with id only on MCP token path (no email)", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        vi.mocked(verifyMcpToken).mockResolvedValue({
            userId: "mcp-user",
            email: "mcp@example.com",
            clientId: "test-client",
            jti: "mcp-jti-1",
            exp: Math.floor(Date.now() / 1000) + 3600,
        });
        const req = createRequest("/api/projects", {
            headers: { authorization: "Bearer mcp-token" },
        });
        await middleware(req);
        expect(Sentry.setUser).toHaveBeenCalledWith({ id: "mcp-user" });
        expect(Sentry.setUser).not.toHaveBeenCalledWith(
            expect.objectContaining({ email: expect.any(String) })
        );
    });

    describe("identity header stripping (SEC-03)", () => {
        it("drops client-supplied x-user-id on the API_TOKEN bearer branch", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            process.env.API_TOKEN = "valid-token";
            const req = createRequest("/api/projects", {
                headers: {
                    authorization: "Bearer valid-token",
                    "x-user-id": "victim-id",
                    "x-user-email": "victim@example.com",
                },
            });
            const res = await middleware(req);
            expect(res.headers.get("x-middleware-request-x-user-id")).toBeNull();
            expect(res.headers.get("x-middleware-request-x-user-email")).toBeNull();
        });

        it("drops client-supplied x-user-id on public paths", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            const req = createRequest("/oauth/register", { headers: { "x-user-id": "victim-id" } });
            const res = await middleware(req);
            expect(res.headers.get("x-middleware-request-x-user-id")).toBeNull();
        });

        it("drops client-supplied x-user-id when auth is disabled", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(false);
            const req = createRequest("/api/projects", { headers: { "x-user-id": "victim-id" } });
            const res = await middleware(req);
            expect(res.headers.get("x-middleware-request-x-user-id")).toBeNull();
        });

        it("drops client-supplied x-user-id on the legacy API_TOKEN cookie branch", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifySessionToken).mockResolvedValue(null);
            process.env.API_TOKEN = "my-token";
            const req = createRequest("/api/projects", {
                headers: { "x-user-id": "victim-id" },
                cookies: { annie_session: await createLegacySessionCookie("my-token") },
            });
            const res = await middleware(req);
            expect(res.status).toBe(200);
            expect(res.headers.get("x-middleware-request-x-user-id")).toBeNull();
        });

        it("overrides client-supplied x-user-id with the verified JWT identity", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifySessionToken).mockResolvedValue({
                userId: "user-123",
                email: "test@example.com",
                name: "Test",
            });
            const req = createRequest("/api/projects", {
                headers: { "x-user-id": "victim-id", "x-user-email": "victim@example.com" },
                cookies: { annie_session: "valid-jwt-token" },
            });
            const res = await middleware(req);
            expect(res.headers.get("x-middleware-request-x-user-id")).toBe("user-123");
            expect(res.headers.get("x-middleware-request-x-user-email")).toBe("test@example.com");
        });

        it("overrides client-supplied x-user-id with the verified MCP identity", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifyMcpToken).mockResolvedValue({
                userId: "mcp-user",
                email: "mcp@example.com",
                clientId: "test-client",
                jti: "mcp-jti-2",
                exp: Math.floor(Date.now() / 1000) + 3600,
            });
            const req = createRequest("/api/projects", {
                headers: { authorization: "Bearer mcp-token", "x-user-id": "victim-id" },
            });
            const res = await middleware(req);
            expect(res.headers.get("x-middleware-request-x-user-id")).toBe("mcp-user");
        });
    });

    describe("CSP nonce injection", () => {
        it("sets Content-Security-Policy header on all passing responses", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(false);
            const res = await middleware(createRequest("/api/health"));
            const csp = res.headers.get("Content-Security-Policy");
            expect(csp).toBeTruthy();
            // Core security guarantee: no unsafe-inline in script-src
            expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
            // Nonce directive is present
            expect(csp).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9+/=_-]+'/);
        });

        it("does not allow Google's font hosts (fonts are self-hosted, SEC-32)", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(false);
            const res = await middleware(createRequest("/api/health"));
            const csp = res.headers.get("Content-Security-Policy");
            expect(csp).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
        });

        it("sets Content-Security-Policy on authenticated responses", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifySessionToken).mockResolvedValue({
                userId: "user-123",
                email: "test@example.com",
                name: "Test",
            });
            const req = createRequest("/api/projects", {
                cookies: { annie_session: "valid-jwt-token" },
            });
            const res = await middleware(req);
            expect(res.status).toBe(200);
            const csp = res.headers.get("Content-Security-Policy");
            expect(csp).toBeTruthy();
            expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
        });

        it("allows the harper.js spell-check worker and WebAssembly without unsafe-eval", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(false);
            const res = await middleware(createRequest("/api/health"));
            const csp = res.headers.get("Content-Security-Policy") ?? "";
            expect(csp).toMatch(/script-src[^;]*'wasm-unsafe-eval'/);
            expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
            expect(csp).toMatch(/worker-src 'self' blob:(;|$)/);
        });

        it("x-nonce request header matches nonce in Content-Security-Policy", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(false);
            const res = await middleware(createRequest("/api/projects"));

            // The nonce forwarded to the page (via request header rewrite)
            const xNonce = res.headers.get("x-middleware-request-x-nonce");
            // The nonce embedded in the CSP
            const csp = res.headers.get("Content-Security-Policy") ?? "";
            const nonceMatch = csp.match(/'nonce-([A-Za-z0-9+/=_-]+)'/);

            expect(xNonce).toBeTruthy();
            expect(nonceMatch).not.toBeNull();
            expect(xNonce).toBe(nonceMatch![1]);
        });
    });

    describe("rate limiting", () => {
        it("returns 429 when JWT user exceeds chat rate limit", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifySessionToken).mockResolvedValue({
                userId: "rate-test-user",
                email: "test@example.com",
                name: "Test",
            });

            // Fill up the chat limit (30 requests)
            for (let i = 0; i < 30; i++) {
                await middleware(createRequest("/api/chat", {
                    method: "POST",
                    cookies: { annie_session: "valid-jwt" },
                }));
            }

            // 31st should be rate limited
            const req = createRequest("/api/chat", {
                method: "POST",
                cookies: { annie_session: "valid-jwt" },
            });
            const res = await middleware(req);
            expect(res.status).toBe(429);
            expect(res.headers.get("Retry-After")).toBeTruthy();
            expect(res.headers.get("X-RateLimit-Limit")).toBe("30");
            expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
        });

        it("returns 429 when Bearer token user exceeds chat rate limit", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            process.env.API_TOKEN = "test-token";

            for (let i = 0; i < 30; i++) {
                await middleware(createRequest("/api/chat", {
                    method: "POST",
                    headers: { authorization: "Bearer test-token" },
                }));
            }

            const req = createRequest("/api/chat", {
                method: "POST",
                headers: { authorization: "Bearer test-token" },
            });
            const res = await middleware(req);
            expect(res.status).toBe(429);
        });

        it("allows read API requests up to 120/min", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifySessionToken).mockResolvedValue({
                userId: "read-test-user",
                email: "test@example.com",
                name: "Test",
            });

            // Fill up the read limit (120 requests)
            for (let i = 0; i < 120; i++) {
                await middleware(createRequest("/api/projects", {
                    cookies: { annie_session: "valid-jwt" },
                }));
            }

            // 121st should fail
            const req = createRequest("/api/projects", {
                cookies: { annie_session: "valid-jwt" },
            });
            const res = await middleware(req);
            expect(res.status).toBe(429);
            expect(res.headers.get("X-RateLimit-Limit")).toBe("120");
        });

        it("allows write API requests up to 60/min", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifySessionToken).mockResolvedValue({
                userId: "write-test-user",
                email: "test@example.com",
                name: "Test",
            });

            // Fill up the write limit (60 requests)
            for (let i = 0; i < 60; i++) {
                await middleware(createRequest("/api/nodes/123", {
                    method: "PATCH",
                    cookies: { annie_session: "valid-jwt" },
                }));
            }

            // 61st should fail
            const req = createRequest("/api/nodes/123", {
                method: "PATCH",
                cookies: { annie_session: "valid-jwt" },
            });
            const res = await middleware(req);
            expect(res.status).toBe(429);
            expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
        });

        it("returns 429 when project creation limit exceeded (100/hour)", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifySessionToken).mockResolvedValue({
                userId: "project-create-user",
                email: "test@example.com",
                name: "Test",
            });

            // Fill up the project creation limit (100 requests)
            for (let i = 0; i < 100; i++) {
                await middleware(createRequest("/api/projects", {
                    method: "POST",
                    cookies: { annie_session: "valid-jwt" },
                }));
            }

            // 101st should be rate limited
            const req = createRequest("/api/projects", {
                method: "POST",
                cookies: { annie_session: "valid-jwt" },
            });
            const res = await middleware(req);
            expect(res.status).toBe(429);
            expect(res.headers.get("X-RateLimit-Limit")).toBe("100");
        });

        it("returns 429 when feedback submission limit exceeded (5/hour)", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifySessionToken).mockResolvedValue({
                userId: "feedback-user",
                email: "test@example.com",
                name: "Test",
            });

            // Fill up the feedback limit (5 requests)
            for (let i = 0; i < 5; i++) {
                await middleware(createRequest("/api/feedback", {
                    method: "POST",
                    cookies: { annie_session: "valid-jwt" },
                }));
            }

            // 6th should be rate limited
            const req = createRequest("/api/feedback", {
                method: "POST",
                cookies: { annie_session: "valid-jwt" },
            });
            const res = await middleware(req);
            expect(res.status).toBe(429);
            expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
        });

        it("returns 429 when project import limit exceeded (20/hour)", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifySessionToken).mockResolvedValue({
                userId: "project-import-user",
                email: "test@example.com",
                name: "Test",
            });

            // Fill up the project import limit (20 requests)
            for (let i = 0; i < 20; i++) {
                await middleware(createRequest("/api/projects/import", {
                    method: "POST",
                    cookies: { annie_session: "valid-jwt" },
                }));
            }

            // 21st should be rate limited
            const req = createRequest("/api/projects/import", {
                method: "POST",
                cookies: { annie_session: "valid-jwt" },
            });
            const res = await middleware(req);
            expect(res.status).toBe(429);
            expect(res.headers.get("Retry-After")).toBeTruthy();
            expect(res.headers.get("X-RateLimit-Limit")).toBe("20");
            expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
        });

        it("project import limit does not affect other POST routes", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifySessionToken).mockResolvedValue({
                userId: "project-import-separate",
                email: "test@example.com",
                name: "Test",
            });

            // Exhaust the import limit
            for (let i = 0; i < 20; i++) {
                await middleware(createRequest("/api/projects/import", {
                    method: "POST",
                    cookies: { annie_session: "valid-jwt" },
                }));
            }

            // A different POST route should still succeed (write bucket is separate)
            const req = createRequest("/api/other-route", {
                method: "POST",
                cookies: { annie_session: "valid-jwt" },
            });
            const res = await middleware(req);
            expect(res.status).toBe(200);
        });

        it("project create limit does not affect other POST routes", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifySessionToken).mockResolvedValue({
                userId: "project-create-separate",
                email: "test@example.com",
                name: "Test",
            });

            // Send a few project creates (doesn't need to max out for this test)
            for (let i = 0; i < 5; i++) {
                await middleware(createRequest("/api/projects", {
                    method: "POST",
                    cookies: { annie_session: "valid-jwt" },
                }));
            }

            // POST to another endpoint should still work (uses write limit)
            const req = createRequest("/api/nodes/123", {
                method: "POST",
                cookies: { annie_session: "valid-jwt" },
            });
            const res = await middleware(req);
            expect(res.status).toBe(200);
        });

        it("returns 429 when /api/auth/refresh is called more than 5 times per minute from the same IP", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            const headers = { "x-real-ip": "1.2.3.4" };

            for (let i = 0; i < 5; i++) {
                await middleware(createRequest("/api/auth/refresh", { method: "POST", headers }));
            }

            const res = await middleware(createRequest("/api/auth/refresh", { method: "POST", headers }));
            expect(res.status).toBe(429);
            expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
        });

        it("counts /api/auth/me in the per-IP auth bucket", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            const headers = { "x-real-ip": "9.9.9.9" };

            for (let i = 0; i < 5; i++) {
                expect((await middleware(createRequest("/api/auth/me", { headers }))).status).toBe(200);
            }

            const res = await middleware(createRequest("/api/auth/me", { headers }));
            expect(res.status).toBe(429);
            expect(res.headers.get("Retry-After")).toBe("60");
            expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
        });

        it("shares one per-IP auth bucket across /me, /refresh and /login", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            const headers = { "x-real-ip": "7.7.7.7" };

            for (let i = 0; i < 3; i++) {
                expect((await middleware(createRequest("/api/auth/me", { headers }))).status).toBe(200);
            }
            for (let i = 0; i < 2; i++) {
                expect((await middleware(createRequest("/api/auth/refresh", { method: "POST", headers }))).status).toBe(200);
            }

            const res = await middleware(createRequest("/api/auth/login", { method: "POST", headers }));
            expect(res.status).toBe(429);
        });

        it("returns 429 with Retry-After once an IP exceeds 60/min on other public paths", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            const headers = { "x-real-ip": "4.4.4.4" };

            for (let i = 0; i < 30; i++) {
                expect((await middleware(createRequest("/api/health", { headers }))).status).toBe(200);
                expect((await middleware(createRequest("/version.json", { headers }))).status).toBe(200);
            }

            const res = await middleware(createRequest("/login", { headers }));
            expect(res.status).toBe(429);
            expect(res.headers.get("Retry-After")).toBe("60");
            expect(res.headers.get("X-RateLimit-Limit")).toBe("60");

            const otherIp = await middleware(createRequest("/api/health", { headers: { "x-real-ip": "4.4.4.5" } }));
            expect(otherIp.status).toBe(200);
        });

        it("gives /oauth/token its own 10/min per-IP bucket", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            const headers = { "x-real-ip": "3.3.3.3" };

            for (let i = 0; i < 10; i++) {
                expect((await middleware(createRequest("/oauth/token", { method: "POST", headers }))).status).toBe(200);
            }

            const res = await middleware(createRequest("/oauth/token", { method: "POST", headers }));
            expect(res.status).toBe(429);
            expect(res.headers.get("Retry-After")).toBe("60");
            expect(res.headers.get("X-RateLimit-Limit")).toBe("10");

            expect((await middleware(createRequest("/api/health", { headers }))).status).toBe(200);
        });

        it("ignores DISABLE_RATE_LIMIT on public paths in production", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.stubEnv("DISABLE_RATE_LIMIT", "true");
            vi.stubEnv("NODE_ENV", "production");
            try {
                const headers = { "x-real-ip": "2.2.2.2" };
                for (let i = 0; i < 5; i++) {
                    await middleware(createRequest("/api/auth/login", { method: "POST", headers }));
                }
                const res = await middleware(createRequest("/api/auth/login", { method: "POST", headers }));
                expect(res.status).toBe(429);
            } finally {
                vi.unstubAllEnvs();
            }
        });

        it("bypasses public-path limits with DISABLE_RATE_LIMIT outside production", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.stubEnv("DISABLE_RATE_LIMIT", "true");
            try {
                const headers = { "x-real-ip": "2.2.2.3" };
                for (let i = 0; i < 11; i++) {
                    expect((await middleware(createRequest("/oauth/token", { method: "POST", headers }))).status).toBe(200);
                }
            } finally {
                vi.unstubAllEnvs();
            }
        });

        it("ignores a spoofed x-forwarded-for when keying the auth rate limit", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            const refresh = (i: number) => createRequest("/api/auth/refresh", {
                method: "POST",
                headers: { "x-real-ip": "5.6.7.8", "x-forwarded-for": `10.0.0.${i}` },
            });

            for (let i = 0; i < 5; i++) {
                await middleware(refresh(i));
            }

            const res = await middleware(refresh(5));
            expect(res.status).toBe(429);
        });

        it("does not rate limit when auth is disabled", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(false);
            // A few requests should pass without rate limiting
            for (let i = 0; i < 5; i++) {
                const res = await middleware(createRequest("/api/chat", { method: "POST" }));
                expect(res.status).toBe(200);
            }
        });

        it("tracks chat and read/write limits separately", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifySessionToken).mockResolvedValue({
                userId: "separate-test",
                email: "test@example.com",
                name: "Test",
            });

            // Fill up the chat limit (30 requests)
            for (let i = 0; i < 30; i++) {
                await middleware(createRequest("/api/chat", {
                    method: "POST",
                    cookies: { annie_session: "valid-jwt" },
                }));
            }

            // Chat should be blocked
            const chatReq = createRequest("/api/chat", {
                method: "POST",
                cookies: { annie_session: "valid-jwt" },
            });
            expect((await middleware(chatReq)).status).toBe(429);

            // But read API should still work
            const apiReq = createRequest("/api/projects", {
                cookies: { annie_session: "valid-jwt" },
            });
            expect((await middleware(apiReq)).status).toBe(200);
        });

        it("tracks read and write limits separately", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifySessionToken).mockResolvedValue({
                userId: "rw-separate-test",
                email: "test@example.com",
                name: "Test",
            });

            // Fill up the write limit (60 requests)
            for (let i = 0; i < 60; i++) {
                await middleware(createRequest(`/api/nodes/${i}`, {
                    method: "PATCH",
                    cookies: { annie_session: "valid-jwt" },
                }));
            }

            // Write should be blocked
            const writeReq = createRequest("/api/nodes/999", {
                method: "PATCH",
                cookies: { annie_session: "valid-jwt" },
            });
            expect((await middleware(writeReq)).status).toBe(429);

            // But read should still work
            const readReq = createRequest("/api/projects", {
                cookies: { annie_session: "valid-jwt" },
            });
            expect((await middleware(readReq)).status).toBe(200);
        });
    });
});
