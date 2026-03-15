import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { deriveSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

describe("auth utilities", () => {
    it("deriveSessionToken produces consistent hex output", async () => {
        const token1 = await deriveSessionToken("test-token-123");
        const token2 = await deriveSessionToken("test-token-123");
        expect(token1).toBe(token2);
        expect(token1).toMatch(/^[0-9a-f]{64}$/);
    });

    it("deriveSessionToken produces different output for different inputs", async () => {
        const a = await deriveSessionToken("token-a");
        const b = await deriveSessionToken("token-b");
        expect(a).not.toBe(b);
    });

    it("SESSION_COOKIE_NAME is defined", () => {
        expect(SESSION_COOKIE_NAME).toBe("annie_session");
    });
});

describe("middleware auth logic", () => {
    const TEST_TOKEN = "test-api-token-xyz";
    let originalEnv: string | undefined;

    beforeEach(() => {
        originalEnv = process.env.API_TOKEN;
    });

    afterEach(() => {
        if (originalEnv !== undefined) {
            process.env.API_TOKEN = originalEnv;
        } else {
            delete process.env.API_TOKEN;
        }
        vi.restoreAllMocks();
    });

    describe("login endpoint logic", () => {
        it("rejects when API_TOKEN not configured", async () => {
            delete process.env.API_TOKEN;
            // Import fresh to test behavior
            const { POST } = await import("@/app/api/auth/login/route");
            const req = new Request("http://localhost/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: "anything" }),
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = await POST(req as any);
            expect(res.status).toBe(501);
        });

        it("rejects invalid token", async () => {
            process.env.API_TOKEN = TEST_TOKEN;
            const { POST } = await import("@/app/api/auth/login/route");
            const req = new Request("http://localhost/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: "wrong-token" }),
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = await POST(req as any);
            expect(res.status).toBe(401);
        });

        it("sets session cookie on valid token", async () => {
            process.env.API_TOKEN = TEST_TOKEN;
            const { POST } = await import("@/app/api/auth/login/route");
            const req = new Request("http://localhost/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: TEST_TOKEN }),
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = await POST(req as any);
            expect(res.status).toBe(200);
            const setCookie = res.headers.get("set-cookie");
            expect(setCookie).toContain("annie_session=");
            expect(setCookie).toContain("HttpOnly");
            expect(setCookie?.toLowerCase()).toContain("samesite=strict");
        });
    });

    describe("logout endpoint logic", () => {
        it("clears session cookie", async () => {
            const { POST } = await import("@/app/api/auth/logout/route");
            const res = await POST();
            expect(res.status).toBe(200);
            const setCookie = res.headers.get("set-cookie");
            expect(setCookie).toContain("annie_session=");
            expect(setCookie).toContain("Max-Age=0");
        });
    });
});
