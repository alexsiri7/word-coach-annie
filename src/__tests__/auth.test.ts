import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    deriveSessionToken,
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE,
    REFRESH_MAX_AGE,
    createSessionToken,
    verifySessionToken,
    isAuthEnabled,
    isGoogleAuthMode,
    isAllowedRedirect,
    getJwtKey,
    resolveJwtSecret,
    safeEqual,
} from "@/lib/auth";
import {
    createRefreshToken,
    verifyRefreshToken,
    verifySessionTokenNode,
} from "@/lib/auth-server";

vi.mock("@/lib/token-blocklist", () => ({
    isTokenRevoked: vi.fn(async () => false),
    revokeToken: vi.fn(async () => undefined),
}));

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

    it("includes a jti claim in created tokens", async () => {
        const token = await createSessionToken({ userId: "u1", email: "u@test.com", name: "U" });
        const verified = await verifySessionToken(token);
        expect(verified?.jti).toBeDefined();
        expect(typeof verified?.jti).toBe("string");
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

    it("rejects a token signed with wrong algorithm (none attack)", async () => {
        const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }))
            .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        const body = btoa(JSON.stringify({ userId: "x", email: "x@x.com", name: "x" }))
            .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        const result = await verifySessionToken(`${header}.${body}.`);
        expect(result).toBeNull();
    });

    it("rejects a valid HS256 token without issuer/audience claims", async () => {
        const { SignJWT } = await import("jose");
        const key = await getJwtKey();
        const token = await new SignJWT({ userId: "user-1", email: "a@b.com", name: "A" })
            .setProtectedHeader({ alg: "HS256" })
            .setExpirationTime("1h")
            .sign(key);
        const result = await verifySessionToken(token);
        expect(result).toBeNull();
    });

    it("rejects an MCP access token presented to session verifier", async () => {
        const { createMcpToken, ACCESS_TOKEN_TTL } = await import("@/lib/oauth-tokens");
        const mcpToken = await createMcpToken(
            { userId: "user-1", email: "a@b.com", type: "mcp_access", clientId: "c1" },
            ACCESS_TOKEN_TTL
        );
        const result = await verifySessionToken(mcpToken);
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

    it("JWT exp is within SESSION_MAX_AGE (1 hour) of issuance", async () => {
        const { jwtVerify } = await import("jose");
        const token = await createSessionToken({ userId: "u1", email: "u@test.com", name: "U" });
        const key = await getJwtKey();
        const { payload } = await jwtVerify(token, key);
        const lifetime = (payload.exp as number) - (payload.iat as number);
        expect(lifetime).toBe(SESSION_MAX_AGE); // exactly SESSION_MAX_AGE seconds
    });
});

describe("verifySessionTokenNode — blocklist integration", () => {
    let origJwt: string | undefined;

    beforeEach(async () => {
        origJwt = process.env.JWT_SECRET;
        process.env.JWT_SECRET = "test-jwt-secret";
        const { isTokenRevoked } = await import("@/lib/token-blocklist");
        (isTokenRevoked as ReturnType<typeof vi.fn>).mockReset();
        (isTokenRevoked as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    });

    afterEach(() => {
        if (origJwt !== undefined) process.env.JWT_SECRET = origJwt;
        else delete process.env.JWT_SECRET;
    });

    it("returns null for a revoked token (blocklist returns true)", async () => {
        const { isTokenRevoked } = await import("@/lib/token-blocklist");
        (isTokenRevoked as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

        const token = await createSessionToken({ userId: "u1", email: "u@test.com", name: "U" });
        const result = await verifySessionTokenNode(token);
        expect(result).toBeNull();
        expect(isTokenRevoked).toHaveBeenCalled();
    });

    it("returns session when blocklist returns false", async () => {
        const token = await createSessionToken({ userId: "u1", email: "u@test.com", name: "U" });
        const result = await verifySessionTokenNode(token);
        expect(result).not.toBeNull();
        expect(result?.userId).toBe("u1");
    });

    it("returns null if isTokenRevoked throws unexpectedly", async () => {
        // Note: the real isTokenRevoked catches DB errors and returns false (fail-open behavior).
        // That fail-open is tested in token-blocklist.test.ts.
        // verifySessionTokenNode wraps the blocklist check in a try-catch: unexpected errors
        // are logged and treated as null (fail-safe) rather than propagated to callers.
        const { isTokenRevoked } = await import("@/lib/token-blocklist");
        (isTokenRevoked as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Unexpected"));

        const token = await createSessionToken({ userId: "u1", email: "u@test.com", name: "U" });
        // isTokenRevoked throws → caught inside verifySessionTokenNode → returns null
        await expect(verifySessionTokenNode(token)).resolves.toBeNull();
    });

    it("verifySessionToken (Edge-safe) does NOT check blocklist", async () => {
        // verifySessionToken no longer consults the blocklist — it is Edge-safe.
        // Use verifySessionTokenNode for blocklist enforcement in Node.js routes.
        const { isTokenRevoked } = await import("@/lib/token-blocklist");
        (isTokenRevoked as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

        const token = await createSessionToken({ userId: "u1", email: "u@test.com", name: "U" });
        const result = await verifySessionToken(token);
        // verifySessionToken returns a valid session (does not check blocklist)
        expect(result).not.toBeNull();
        expect(isTokenRevoked).not.toHaveBeenCalled();
    });
});

describe("refresh token functions", () => {
    let origJwt: string | undefined;

    beforeEach(async () => {
        origJwt = process.env.JWT_SECRET;
        process.env.JWT_SECRET = "test-jwt-secret";
        const { isTokenRevoked } = await import("@/lib/token-blocklist");
        (isTokenRevoked as ReturnType<typeof vi.fn>).mockReset();
        (isTokenRevoked as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    });

    afterEach(() => {
        if (origJwt !== undefined) process.env.JWT_SECRET = origJwt;
        else delete process.env.JWT_SECRET;
    });

    it("round-trips: createRefreshToken → verifyRefreshToken returns payload", async () => {
        const payload = { userId: "u1", email: "u@test.com", name: "Test", picture: "https://example.com/pic.jpg" };
        const token = await createRefreshToken(payload);
        expect(token).toBeTruthy();
        expect(token.split(".")).toHaveLength(3);

        const result = await verifyRefreshToken(token);
        expect(result).not.toBeNull();
        expect(result!.userId).toBe("u1");
        expect(result!.email).toBe("u@test.com");
        expect(result!.name).toBe("Test");
        expect(result!.picture).toBe("https://example.com/pic.jpg");
        expect(result!.jti).toBeDefined();
    });

    it("rejects a session token used as a refresh token (audience mismatch)", async () => {
        const token = await createSessionToken({ userId: "u1", email: "u@test.com", name: "Test" });
        const result = await verifyRefreshToken(token);
        expect(result).toBeNull();
    });

    it("rejects a refresh token used as a session token (audience mismatch)", async () => {
        const token = await createRefreshToken({ userId: "u1", email: "u@test.com", name: "Test" });
        const result = await verifySessionToken(token);
        expect(result).toBeNull();
    });

    it("returns null for a revoked refresh token", async () => {
        const { isTokenRevoked } = await import("@/lib/token-blocklist");
        (isTokenRevoked as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);

        const token = await createRefreshToken({ userId: "u1", email: "u@test.com", name: "Test" });
        const result = await verifyRefreshToken(token);
        expect(result).toBeNull();
        expect(isTokenRevoked).toHaveBeenCalled();
    });

    it("returns null for a tampered token", async () => {
        const result = await verifyRefreshToken("not-a-valid-jwt");
        expect(result).toBeNull();
    });

    it("refresh token exp matches REFRESH_MAX_AGE (30 days)", async () => {
        const { jwtVerify } = await import("jose");
        const token = await createRefreshToken({ userId: "u1", email: "u@test.com", name: "U" });
        const key = await getJwtKey();
        const { payload } = await jwtVerify(token, key, { audience: "word-coach-annie:refresh" });
        const lifetime = (payload.exp as number) - (payload.iat as number);
        expect(lifetime).toBe(REFRESH_MAX_AGE);
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

describe("isGoogleAuthMode", () => {
    let origGoogleClientId: string | undefined;

    beforeEach(() => {
        origGoogleClientId = process.env.GOOGLE_CLIENT_ID;
    });

    afterEach(() => {
        if (origGoogleClientId !== undefined) process.env.GOOGLE_CLIENT_ID = origGoogleClientId;
        else delete process.env.GOOGLE_CLIENT_ID;
    });

    it("returns false when GOOGLE_CLIENT_ID is not set", () => {
        delete process.env.GOOGLE_CLIENT_ID;
        expect(isGoogleAuthMode()).toBe(false);
    });

    it("returns true when GOOGLE_CLIENT_ID is set", () => {
        process.env.GOOGLE_CLIENT_ID = "test-client-id";
        expect(isGoogleAuthMode()).toBe(true);
    });
});

describe("resolveJwtSecret", () => {
    let origJwt: string | undefined;
    let origApiToken: string | undefined;

    beforeEach(() => {
        origJwt = process.env.JWT_SECRET;
        origApiToken = process.env.API_TOKEN;
    });

    afterEach(() => {
        if (origJwt !== undefined) process.env.JWT_SECRET = origJwt;
        else delete process.env.JWT_SECRET;
        if (origApiToken !== undefined) process.env.API_TOKEN = origApiToken;
        else delete process.env.API_TOKEN;
    });

    it("returns JWT_SECRET when set", () => {
        process.env.JWT_SECRET = "my-super-secret-key";
        expect(resolveJwtSecret()).toBe("my-super-secret-key");
    });

    it("returns 'annie-dev-secret' when auth is disabled", () => {
        delete process.env.JWT_SECRET;
        delete process.env.API_TOKEN;
        delete process.env.GOOGLE_CLIENT_ID;
        expect(resolveJwtSecret()).toBe("annie-dev-secret");
    });

    it("throws when auth is enabled but no JWT_SECRET", () => {
        delete process.env.JWT_SECRET;
        process.env.API_TOKEN = "some-token";
        expect(() => resolveJwtSecret()).toThrow("JWT_SECRET is required");
    });
});

describe("safeEqual", () => {
    it("returns true for identical strings", () => {
        expect(safeEqual("abc", "abc")).toBe(true);
    });

    it("returns false for different strings of same length", () => {
        expect(safeEqual("abc", "abd")).toBe(false);
    });

    it("returns false for strings of different lengths", () => {
        expect(safeEqual("ab", "abc")).toBe(false);
    });

    it("returns true for empty strings", () => {
        expect(safeEqual("", "")).toBe(true);
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
            const { NextRequest } = await import("next/server");
            const { POST } = await import("@/app/api/auth/logout/route");
            const req = new NextRequest("http://localhost/api/auth/logout", {
                method: "POST",
            });
            const res = await POST(req);
            expect(res.status).toBe(200);
            const setCookie = res.headers.get("set-cookie");
            expect(setCookie).toContain("annie_session=");
            expect(setCookie).toContain("Max-Age=0");
        });
    });
});
