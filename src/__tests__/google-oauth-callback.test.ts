import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

const mockUserinfoGet = vi.fn();
const mockGetToken = vi.fn();
const mockSetCredentials = vi.fn();

vi.mock("googleapis", () => ({
    google: {
        auth: {
            OAuth2: class {
                getToken = mockGetToken;
                setCredentials = mockSetCredentials;
            },
        },
        oauth2: () => ({
            userinfo: { get: mockUserinfoGet },
        }),
    },
}));

vi.mock("@/lib/env", () => ({
    env: {
        GOOGLE_CLIENT_ID: "test-client-id",
        GOOGLE_CLIENT_SECRET: "test-client-secret",
        GOOGLE_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
    },
}));

vi.mock("@/lib/db", () => ({
    prisma: {
        user: {
            upsert: vi.fn().mockResolvedValue({
                id: "user-1",
                email: "test@example.com",
                name: "Test User",
                picture: null,
            }),
        },
    },
}));

vi.mock("@/lib/auth", () => ({
    SESSION_COOKIE_NAME: "session",
    SESSION_MAX_AGE: 3600,
    REFRESH_COOKIE_NAME: "annie_refresh",
    REFRESH_MAX_AGE: 2592000,
    createSessionToken: vi.fn().mockResolvedValue("mock-jwt-token"),
    isAllowedRedirect: vi.fn().mockReturnValue(false),
    resolveJwtSecret: vi.fn().mockReturnValue("annie-dev-secret"),
    // timing-safe comparison is irrelevant in unit tests; using vi.fn() enables spy assertions
    safeEqual: vi.fn().mockImplementation((a: string, b: string) => a === b),
}));

vi.mock("@/lib/auth-server", () => ({
    createRefreshToken: vi.fn().mockResolvedValue("mock-refresh-token"),
    isEmailAllowed: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/logger", () => ({
    logger: {
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

// Helper to generate a valid signed state using the test secret
function makeSignedState(nonce: string = "test-nonce"): string {
    const secret = "annie-dev-secret"; // matches resolveJwtSecret() mock
    const sig = crypto.createHmac("sha256", secret).update(nonce).digest("hex").slice(0, 16);
    return `${nonce}.${sig}`;
}

function makeRequest(params?: Record<string, string>, cookies?: Record<string, string>) {
    const url = new URL("http://localhost:3000/api/auth/google/callback");
    const signedState = makeSignedState("test-nonce");
    url.searchParams.set("code", "test-code");
    url.searchParams.set("state", signedState);
    for (const [k, v] of Object.entries(params ?? {})) {
        url.searchParams.set(k, v);
    }
    const req = new NextRequest(url, {
        headers: new Headers({
            cookie: Object.entries({ oauth_state: signedState, ...cookies })
                .map(([k, v]) => `${k}=${v}`)
                .join("; "),
        }),
    });
    return req;
}

describe("Google OAuth callback - verified_email check", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetToken.mockResolvedValue({
            tokens: { access_token: "tok", refresh_token: "ref" },
        });
    });

    it("should redirect to /login?error=email_not_verified when verified_email is false", async () => {
        mockUserinfoGet.mockResolvedValue({
            data: {
                email: "unverified@example.com",
                id: "google-123",
                verified_email: false,
            },
        });

        const { GET } = await import(
            "@/app/api/auth/google/callback/route"
        );
        const { logger } = await import("@/lib/logger");
        const response = await GET(makeRequest());

        expect(response.status).toBe(307);
        const location = response.headers.get("location") ?? "";
        expect(location).toContain("/login?error=email_not_verified");
        // Exact single-argument assertion intentionally guards against PII re-introduction:
        // if { email } or any second argument were added back, this assertion would fail.
        expect(logger.warn).toHaveBeenCalledWith(
            "OAuth provider rejected user: email not verified"
        );
    });

    it("should redirect to /login?error=email_not_verified when verified_email is undefined", async () => {
        mockUserinfoGet.mockResolvedValue({
            data: {
                email: "noverified@example.com",
                id: "google-456",
                // verified_email omitted → undefined → falsy
            },
        });

        const { GET } = await import(
            "@/app/api/auth/google/callback/route"
        );
        const { logger } = await import("@/lib/logger");
        const response = await GET(makeRequest());

        expect(response.status).toBe(307);
        const location = response.headers.get("location") ?? "";
        expect(location).toContain("/login?error=email_not_verified");
        // Exact single-argument assertion intentionally guards against PII re-introduction:
        // if { email } or any second argument were added back, this assertion would fail.
        expect(logger.warn).toHaveBeenCalledWith(
            "OAuth provider rejected user: email not verified"
        );
    });

    it("should proceed to login when verified_email is true", async () => {
        mockUserinfoGet.mockResolvedValue({
            data: {
                email: "verified@example.com",
                id: "google-789",
                verified_email: true,
                name: "Verified User",
                picture: null,
            },
        });

        const { GET } = await import(
            "@/app/api/auth/google/callback/route"
        );
        const response = await GET(makeRequest());

        expect(response.status).toBe(307);
        const location = response.headers.get("location") ?? "";
        expect(location).not.toContain("error=email_not_verified");
        // Should have session cookie set
        const setCookie = response.headers.getSetCookie();
        const sessionCookie = setCookie.find((c: string) => c.startsWith("session="));
        expect(sessionCookie).toBeDefined();
        expect(sessionCookie).toContain("mock-jwt-token");

        // Should have refresh cookie set with correct security attributes
        const refreshCookie = setCookie.find((c: string) => c.startsWith("annie_refresh="));
        expect(refreshCookie).toBeDefined();
        expect(refreshCookie).toContain("mock-refresh-token");
        expect(refreshCookie?.toLowerCase()).toContain("httponly");
        expect(refreshCookie?.toLowerCase()).toContain("path=/api/auth/");
        expect(refreshCookie?.toLowerCase()).toContain("samesite=lax");

        // The login starts one token family shared by the session and refresh tokens
        const { createSessionToken } = await import("@/lib/auth");
        const { createRefreshToken } = await import("@/lib/auth-server");
        const familyId = vi.mocked(createSessionToken).mock.calls[0][0].familyId;
        expect(familyId).toEqual(expect.any(String));
        expect(vi.mocked(createRefreshToken).mock.calls[0][0].familyId).toBe(familyId);
    });

    it("should redirect to /login?error=invite_only when the email is not allowed", async () => {
        mockUserinfoGet.mockResolvedValue({
            data: {
                email: "outsider@example.com",
                id: "google-999",
                verified_email: true,
                name: "Outsider",
                picture: null,
            },
        });
        const { isEmailAllowed, createRefreshToken } = await import("@/lib/auth-server");
        vi.mocked(isEmailAllowed).mockReturnValueOnce(false);

        const { GET } = await import("@/app/api/auth/google/callback/route");
        const { prisma } = await import("@/lib/db");
        const { createSessionToken } = await import("@/lib/auth");
        const response = await GET(makeRequest());

        expect(response.status).toBe(307);
        expect(response.headers.get("location") ?? "").toContain("/login?error=invite_only");
        expect(isEmailAllowed).toHaveBeenCalledWith("outsider@example.com");
        expect(prisma.user.upsert).not.toHaveBeenCalled();
        expect(createSessionToken).not.toHaveBeenCalled();
        expect(createRefreshToken).not.toHaveBeenCalled();
    });

    it("should redirect to /login?error=invalid_state when state HMAC is tampered", async () => {
        const { GET } = await import("@/app/api/auth/google/callback/route");
        const { safeEqual } = await import("@/lib/auth");
        // state cookie matches URL but HMAC sig is wrong
        const tamperedState = "test-nonce.0000000000000000";
        const req = new NextRequest(
            new URL(`http://localhost:3000/api/auth/google/callback?code=test-code&state=${tamperedState}`),
            {
                headers: new Headers({
                    cookie: `oauth_state=${tamperedState}`,
                }),
            }
        );
        const response = await GET(req);
        expect(response.status).toBe(307);
        const location = response.headers.get("location") ?? "";
        expect(location).toContain("/login?error=invalid_state");
        // Confirm that safeEqual was invoked (HMAC branch was exercised, not short-circuited)
        expect(safeEqual).toHaveBeenCalledOnce();
    });
});

describe("Google OAuth callback — rejection branches", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetToken.mockResolvedValue({
            tokens: { access_token: "tok", refresh_token: "ref" },
        });
    });

    it("returns 400 when the code parameter is missing", async () => {
        const { GET } = await import("@/app/api/auth/google/callback/route");
        const url = new URL("http://localhost:3000/api/auth/google/callback");
        url.searchParams.set("state", makeSignedState());
        const response = await GET(new NextRequest(url));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Missing authorization code" });
        expect(mockGetToken).not.toHaveBeenCalled();
    });

    it("returns 501 when Google OAuth is not configured", async () => {
        const { env } = await import("@/lib/env");
        const original = env.GOOGLE_CLIENT_ID;
        env.GOOGLE_CLIENT_ID = "";
        try {
            const { GET } = await import("@/app/api/auth/google/callback/route");
            const response = await GET(makeRequest());
            expect(response.status).toBe(501);
        } finally {
            env.GOOGLE_CLIENT_ID = original;
        }
    });

    it("redirects to invalid_state when there is no oauth_state cookie", async () => {
        const { GET } = await import("@/app/api/auth/google/callback/route");
        const { safeEqual } = await import("@/lib/auth");
        const url = new URL("http://localhost:3000/api/auth/google/callback");
        url.searchParams.set("code", "test-code");
        url.searchParams.set("state", makeSignedState());
        const response = await GET(new NextRequest(url));

        expect(response.status).toBe(307);
        expect(response.headers.get("location") ?? "").toContain("/login?error=invalid_state");
        expect(safeEqual).not.toHaveBeenCalled();
    });

    it("redirects to invalid_state when the cookie state doesn't match the URL state", async () => {
        const { GET } = await import("@/app/api/auth/google/callback/route");
        const url = new URL("http://localhost:3000/api/auth/google/callback");
        url.searchParams.set("code", "test-code");
        url.searchParams.set("state", makeSignedState("nonce-a"));
        const req = new NextRequest(url, {
            headers: new Headers({ cookie: `oauth_state=${makeSignedState("nonce-b")}` }),
        });
        const response = await GET(req);

        expect(response.status).toBe(307);
        expect(response.headers.get("location") ?? "").toContain("/login?error=invalid_state");
    });

    it("redirects to invalid_state when the state has no dot separator", async () => {
        const { GET } = await import("@/app/api/auth/google/callback/route");
        const { safeEqual } = await import("@/lib/auth");
        const url = new URL("http://localhost:3000/api/auth/google/callback");
        url.searchParams.set("code", "test-code");
        url.searchParams.set("state", "nodotstate");
        const req = new NextRequest(url, {
            headers: new Headers({ cookie: "oauth_state=nodotstate" }),
        });
        const response = await GET(req);

        expect(response.status).toBe(307);
        expect(response.headers.get("location") ?? "").toContain("/login?error=invalid_state");
        expect(safeEqual).not.toHaveBeenCalled();
    });

    it("redirects to invalid_code when the token exchange fails", async () => {
        mockGetToken.mockRejectedValueOnce(new Error("invalid_grant"));
        const { GET } = await import("@/app/api/auth/google/callback/route");
        const { prisma } = await import("@/lib/db");
        const response = await GET(makeRequest());

        expect(response.headers.get("location") ?? "").toContain("/login?error=invalid_code");
        expect(prisma.user.upsert).not.toHaveBeenCalled();
        expect(response.headers.getSetCookie().some((c) => c.startsWith("session="))).toBe(false);
    });

    it.each([
        { id: "g1", verified_email: true },
        { email: "a@b.c", verified_email: true },
    ])("returns 400 when userinfo is missing email or id ($email/$id)", async (data) => {
        mockUserinfoGet.mockResolvedValue({ data });
        const { GET } = await import("@/app/api/auth/google/callback/route");
        const { prisma } = await import("@/lib/db");
        const response = await GET(makeRequest());

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Could not retrieve user info from Google" });
        expect(prisma.user.upsert).not.toHaveBeenCalled();
    });
});

describe("Google OAuth callback — session issuance", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetToken.mockResolvedValue({
            tokens: { access_token: "tok", refresh_token: "ref" },
        });
        mockUserinfoGet.mockResolvedValue({
            data: {
                email: "verified@example.com",
                id: "google-789",
                verified_email: true,
                name: "Verified User",
                picture: null,
            },
        });
    });

    it("issues a session even when refresh-token minting fails", async () => {
        const { createRefreshToken } = await import("@/lib/auth-server");
        vi.mocked(createRefreshToken).mockRejectedValueOnce(new Error("no key"));
        const { GET } = await import("@/app/api/auth/google/callback/route");
        const { logger } = await import("@/lib/logger");
        const response = await GET(makeRequest());

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("http://localhost:3000/");
        const setCookie = response.headers.getSetCookie();
        expect(setCookie.some((c) => c.startsWith("session=mock-jwt-token"))).toBe(true);
        expect(setCookie.some((c) => c.startsWith("annie_refresh="))).toBe(false);
        expect(logger.error).toHaveBeenCalledOnce();
    });

    it("honours an allowed oauth_redirect cookie", async () => {
        const { isAllowedRedirect } = await import("@/lib/auth");
        vi.mocked(isAllowedRedirect).mockReturnValueOnce(true);
        const { GET } = await import("@/app/api/auth/google/callback/route");
        const response = await GET(makeRequest({}, { oauth_redirect: "/read/p1" }));

        expect(response.headers.get("location")).toBe("http://localhost:3000/read/p1");
        const setCookie = response.headers.getSetCookie();
        const redirectCookie = setCookie.find((c) => c.startsWith("oauth_redirect="));
        const stateCookie = setCookie.find((c) => c.startsWith("oauth_state="));
        expect(redirectCookie).toContain("Max-Age=0");
        expect(stateCookie).toContain("Max-Age=0");
    });

    it("falls back to home when the oauth_redirect cookie is not allowed", async () => {
        const { GET } = await import("@/app/api/auth/google/callback/route");
        const response = await GET(makeRequest({}, { oauth_redirect: "//evil.example" }));

        expect(response.headers.get("location")).toBe("http://localhost:3000/");
    });

    it("redirects to callback_failed without leaking the error on an unexpected failure", async () => {
        const { prisma } = await import("@/lib/db");
        vi.mocked(prisma.user.upsert).mockRejectedValueOnce(new Error("db down"));
        const { GET } = await import("@/app/api/auth/google/callback/route");
        const response = await GET(makeRequest());

        expect(response.headers.get("location") ?? "").toContain("/login?error=callback_failed");
        const setCookie = response.headers.getSetCookie();
        expect(setCookie.some((c) => c.startsWith("session="))).toBe(false);
        const body = await response.text();
        expect(body).not.toContain("db down");
    });
});
