import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { resetRateLimitStore } from "@/lib/rate-limit";

// Mock Sentry
vi.mock("@sentry/nextjs", () => ({
    setUser: vi.fn(),
}));

// Mock auth module
vi.mock("@/lib/auth", () => ({
    SESSION_COOKIE_NAME: "annie_session",
    deriveSessionToken: vi.fn(async (token: string) => `hashed_${token}`),
    verifySessionToken: vi.fn(async () => null),
    isAuthEnabled: vi.fn(() => false),
}));

import { isAuthEnabled, deriveSessionToken, verifySessionToken } from "@/lib/auth";

function createRequest(path: string, options?: {
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
}): NextRequest {
    const url = `http://localhost:3000${path}`;
    const req = new NextRequest(url, {
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
    });

    it("allows public paths when auth is enabled", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        const req = createRequest("/api/health");
        const res = await middleware(req);
        expect(res.status).toBe(200);
    });

    it("allows /api/auth/login path", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        const req = createRequest("/api/auth/login");
        const res = await middleware(req);
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

    it("falls back to legacy API_TOKEN session cookie", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        vi.mocked(verifySessionToken).mockResolvedValue(null);
        vi.mocked(deriveSessionToken).mockResolvedValue("hashed_my-token");
        process.env.API_TOKEN = "my-token";
        const req = createRequest("/api/projects", {
            cookies: { annie_session: "hashed_my-token" },
        });
        const res = await middleware(req);
        expect(res.status).toBe(200);
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

    describe("rate limiting", () => {
        it("returns 429 when JWT user exceeds chat rate limit", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifySessionToken).mockResolvedValue({
                userId: "rate-test-user",
                email: "test@example.com",
                name: "Test",
            });

            // Send 30 requests (the chat limit)
            for (let i = 0; i < 30; i++) {
                const req = createRequest("/api/chat", {
                    cookies: { annie_session: "valid-jwt" },
                });
                const res = await middleware(req);
                expect(res.status).toBe(200);
            }

            // 31st should be rate limited
            const req = createRequest("/api/chat", {
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
                const req = createRequest("/api/chat", {
                    headers: { authorization: "Bearer test-token" },
                });
                const res = await middleware(req);
                expect(res.status).toBe(200);
            }

            const req = createRequest("/api/chat", {
                headers: { authorization: "Bearer test-token" },
            });
            const res = await middleware(req);
            expect(res.status).toBe(429);
        });

        it("allows non-chat API requests up to 100/min", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifySessionToken).mockResolvedValue({
                userId: "api-test-user",
                email: "test@example.com",
                name: "Test",
            });

            // 100 requests should all pass
            for (let i = 0; i < 100; i++) {
                const req = createRequest("/api/projects", {
                    cookies: { annie_session: "valid-jwt" },
                });
                const res = await middleware(req);
                expect(res.status).toBe(200);
            }

            // 101st should fail
            const req = createRequest("/api/projects", {
                cookies: { annie_session: "valid-jwt" },
            });
            const res = await middleware(req);
            expect(res.status).toBe(429);
        });

        it("does not rate limit when auth is disabled", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(false);
            // Should always pass through without rate limiting
            for (let i = 0; i < 50; i++) {
                const req = createRequest("/api/chat");
                const res = await middleware(req);
                expect(res.status).toBe(200);
            }
        });

        it("tracks chat and API limits separately", async () => {
            vi.mocked(isAuthEnabled).mockReturnValue(true);
            vi.mocked(verifySessionToken).mockResolvedValue({
                userId: "separate-test",
                email: "test@example.com",
                name: "Test",
            });

            // Max out chat limit
            for (let i = 0; i < 30; i++) {
                const req = createRequest("/api/chat", {
                    cookies: { annie_session: "valid-jwt" },
                });
                await middleware(req);
            }

            // Chat should be blocked
            const chatReq = createRequest("/api/chat", {
                cookies: { annie_session: "valid-jwt" },
            });
            expect((await middleware(chatReq)).status).toBe(429);

            // But API should still work
            const apiReq = createRequest("/api/projects", {
                cookies: { annie_session: "valid-jwt" },
            });
            expect((await middleware(apiReq)).status).toBe(200);
        });
    });
});
