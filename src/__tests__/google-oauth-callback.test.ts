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
        ALLOWED_EMAILS: undefined,
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
    SESSION_MAX_AGE: 86400,
    createSessionToken: vi.fn().mockResolvedValue("mock-jwt-token"),
    isAllowedRedirect: vi.fn().mockReturnValue(false),
    resolveJwtSecret: vi.fn().mockReturnValue("annie-dev-secret"),
    // timing-safe comparison is irrelevant in unit tests; using vi.fn() enables spy assertions
    safeEqual: vi.fn().mockImplementation((a: string, b: string) => a === b),
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
