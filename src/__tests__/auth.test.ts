import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    deriveSessionToken,
    SESSION_COOKIE_NAME,
    createSessionToken,
    verifySessionToken,
    isAuthEnabled,
    isAllowedRedirect,
} from "@/lib/auth";

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

describe("JWT session tokens", () => {
    let origJwt: string | undefined;
    let origApiToken: string | undefined;

    beforeEach(() => {
        origJwt = process.env.JWT_SECRET;
        origApiToken = process.env.API_TOKEN;
        process.env.JWT_SECRET = "test-jwt-secret";
    });

    afterEach(() => {
        if (origJwt !== undefined) process.env.JWT_SECRET = origJwt;
        else delete process.env.JWT_SECRET;
        if (origApiToken !== undefined) process.env.API_TOKEN = origApiToken;
        else delete process.env.API_TOKEN;
    });

    it("creates and verifies JWT round-trip", async () => {
        const payload = {
            userId: "user-123",
            email: "test@example.com",
            name: "Test User",
            picture: "https://example.com/pic.jpg",
        };
        const token = await createSessionToken(payload);
        expect(token).toBeTruthy();
        expect(token.split(".")).toHaveLength(3); // JWT format

        const verified = await verifySessionToken(token);
        expect(verified).not.toBeNull();
        expect(verified!.userId).toBe("user-123");
        expect(verified!.email).toBe("test@example.com");
        expect(verified!.name).toBe("Test User");
        expect(verified!.picture).toBe("https://example.com/pic.jpg");
    });

    it("returns null for invalid JWT", async () => {
        const result = await verifySessionToken("invalid.token.here");
        expect(result).toBeNull();
    });

    it("returns null for tampered JWT", async () => {
        const token = await createSessionToken({
            userId: "user-1",
            email: "a@b.com",
            name: "A",
        });
        // Tamper with payload
        const parts = token.split(".");
        parts[1] = "eyJ0ZXN0IjoidGFtcGVyZWQifQ";
        const tampered = parts.join(".");
        const result = await verifySessionToken(tampered);
        expect(result).toBeNull();
    });

    it("returns null for JWT missing required fields", async () => {
        // Create a JWT with jose directly without userId
        const { SignJWT } = await import("jose");
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode("test-jwt-secret"),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );
        const token = await new SignJWT({ foo: "bar" })
            .setProtectedHeader({ alg: "HS256" })
            .setExpirationTime("1h")
            .sign(key);
        const result = await verifySessionToken(token);
        expect(result).toBeNull();
    });
});

describe("isAuthEnabled", () => {
    let origApiToken: string | undefined;
    let origGoogleClientId: string | undefined;

    beforeEach(() => {
        origApiToken = process.env.API_TOKEN;
        origGoogleClientId = process.env.GOOGLE_CLIENT_ID;
    });

    afterEach(() => {
        if (origApiToken !== undefined) process.env.API_TOKEN = origApiToken;
        else delete process.env.API_TOKEN;
        if (origGoogleClientId !== undefined) process.env.GOOGLE_CLIENT_ID = origGoogleClientId;
        else delete process.env.GOOGLE_CLIENT_ID;
    });

    it("returns false when no auth configured", () => {
        delete process.env.API_TOKEN;
        delete process.env.GOOGLE_CLIENT_ID;
        expect(isAuthEnabled()).toBe(false);
    });

    it("returns true when API_TOKEN set", () => {
        process.env.API_TOKEN = "test";
        delete process.env.GOOGLE_CLIENT_ID;
        expect(isAuthEnabled()).toBe(true);
    });

    it("returns true when GOOGLE_CLIENT_ID set", () => {
        delete process.env.API_TOKEN;
        process.env.GOOGLE_CLIENT_ID = "test-client-id";
        expect(isAuthEnabled()).toBe(true);
    });
});

describe("isAllowedRedirect", () => {
    it("allows known user-facing routes", () => {
        expect(isAllowedRedirect("/")).toBe(true);
        expect(isAllowedRedirect("/settings")).toBe(true);
        expect(isAllowedRedirect("/settings/profile")).toBe(true);
        expect(isAllowedRedirect("/setup")).toBe(true);
        expect(isAllowedRedirect("/project/abc123")).toBe(true);
        expect(isAllowedRedirect("/project/abc123/timeline")).toBe(true);
        expect(isAllowedRedirect("/read/abc123")).toBe(true);
        expect(isAllowedRedirect("/universe")).toBe(true);
        expect(isAllowedRedirect("/universe/abc123")).toBe(true);
    });

    it("allows query strings on known routes", () => {
        expect(isAllowedRedirect("/settings?tab=billing")).toBe(true);
        expect(isAllowedRedirect("/project/abc123?view=graph")).toBe(true);
    });

    it("blocks cross-origin and protocol injection attempts", () => {
        expect(isAllowedRedirect("//evil.com")).toBe(false);
        expect(isAllowedRedirect("javascript:alert(1)")).toBe(false);
        expect(isAllowedRedirect("/\\evil.com")).toBe(false);
        expect(isAllowedRedirect("/path?redirect=http://evil.com")).toBe(false);
    });

    it("blocks unknown app paths", () => {
        expect(isAllowedRedirect("/api/admin")).toBe(false);
        expect(isAllowedRedirect("/login")).toBe(false);
        expect(isAllowedRedirect("/dmca")).toBe(false);
        expect(isAllowedRedirect("/privacy")).toBe(false);
    });

    it("blocks empty and non-string values", () => {
        expect(isAllowedRedirect("")).toBe(false);
        expect(isAllowedRedirect(null as unknown as string)).toBe(false);
        expect(isAllowedRedirect(undefined as unknown as string)).toBe(false);
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
