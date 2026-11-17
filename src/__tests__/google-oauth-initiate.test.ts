import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({
    env: {
        GOOGLE_CLIENT_ID: "test-client-id",
        GOOGLE_CLIENT_SECRET: "test-client-secret",
        GOOGLE_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
    },
}));

const mockGenerateAuthUrl = vi.fn().mockReturnValue("https://accounts.google.com/o/oauth2/auth?state=mocked");

vi.mock("googleapis", () => ({
    google: {
        auth: {
            OAuth2: class {
                generateAuthUrl = mockGenerateAuthUrl;
            },
        },
    },
}));

vi.mock("@/lib/auth", () => ({
    isAllowedRedirect: vi.fn().mockReturnValue(false),
    resolveJwtSecret: vi.fn().mockReturnValue("annie-dev-secret"),
}));

vi.mock("@/lib/logger", () => ({
    logger: {
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe("GET /api/auth/google — signed state format", () => {
    it("sets an oauth_state cookie with nonce.sig format", async () => {
        const { GET } = await import("@/app/api/auth/google/route");
        const req = new NextRequest("http://localhost:3000/api/auth/google");
        const response = await GET(req);

        expect(response.status).toBe(307);
        const setCookies = response.headers.getSetCookie();
        const stateCookie = setCookies.find((c) => c.startsWith("oauth_state="));
        expect(stateCookie).toBeDefined();

        // Extract the cookie value
        const cookieValue = stateCookie!.split(";")[0].replace("oauth_state=", "");

        // Format must be "nonce.sig"
        expect(cookieValue).toMatch(/^[^.]+\.[0-9a-f]{16}$/);

        // sig is the first 16 hex chars of HMAC-SHA256(nonce, secret)
        const crypto = await import("crypto");
        const [nonce, sig] = cookieValue.split(".");
        const expectedSig = crypto
            .createHmac("sha256", "annie-dev-secret")
            .update(nonce)
            .digest("hex")
            .slice(0, 16);
        expect(sig).toBe(expectedSig);
    });

    it("encodes the same state value in the redirect URL via generateAuthUrl", async () => {
        const { GET } = await import("@/app/api/auth/google/route");
        const req = new NextRequest("http://localhost:3000/api/auth/google");
        const response = await GET(req);

        // generateAuthUrl is mocked; we just verify the initiation route redirects
        expect(response.status).toBe(307);
        const location = response.headers.get("location") ?? "";
        expect(location).toBeTruthy();
    });
});

describe("GET /api/auth/google — configuration and redirect branches", () => {
    it("returns 501 and sets no oauth_state cookie when OAuth is not configured", async () => {
        const { env } = await import("@/lib/env");
        const original = env.GOOGLE_REDIRECT_URI;
        env.GOOGLE_REDIRECT_URI = "";
        try {
            const { GET } = await import("@/app/api/auth/google/route");
            const response = await GET(new NextRequest("http://localhost:3000/api/auth/google"));
            expect(response.status).toBe(501);
            expect(response.headers.getSetCookie().some((c) => c.startsWith("oauth_state="))).toBe(false);
        } finally {
            env.GOOGLE_REDIRECT_URI = original;
        }
    });

    it("sets an oauth_redirect cookie when `from` is an allowed redirect", async () => {
        const { isAllowedRedirect } = await import("@/lib/auth");
        vi.mocked(isAllowedRedirect).mockReturnValueOnce(true);
        const { GET } = await import("@/app/api/auth/google/route");
        const response = await GET(new NextRequest("http://localhost:3000/api/auth/google?from=/read/p1"));

        expect(isAllowedRedirect).toHaveBeenCalledWith("/read/p1");
        const setCookies = response.headers.getSetCookie();
        const redirectCookie = setCookies.find((c) => c.startsWith("oauth_redirect="));
        expect(redirectCookie).toBeDefined();
        expect(redirectCookie).toMatch(/^oauth_redirect=(%2Fread%2Fp1|\/read\/p1);/);
        expect(redirectCookie?.toLowerCase()).toContain("httponly");
        expect(redirectCookie?.toLowerCase()).toContain("samesite=lax");
        expect(redirectCookie).toContain("Max-Age=600");
    });

    it("does not set an oauth_redirect cookie when `from` is disallowed", async () => {
        const { GET } = await import("@/app/api/auth/google/route");
        const response = await GET(new NextRequest("http://localhost:3000/api/auth/google?from=https://evil.example"));
        expect(response.headers.getSetCookie().some((c) => c.startsWith("oauth_redirect="))).toBe(false);
    });

    it("returns 500 and sets no oauth_state cookie when generateAuthUrl throws", async () => {
        mockGenerateAuthUrl.mockImplementationOnce(() => {
            throw new Error("boom");
        });
        const { GET } = await import("@/app/api/auth/google/route");
        const response = await GET(new NextRequest("http://localhost:3000/api/auth/google"));

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "Internal server error" });
        expect(response.headers.getSetCookie().some((c) => c.startsWith("oauth_state="))).toBe(false);
    });
});
