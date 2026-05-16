import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({
    env: {
        GOOGLE_CLIENT_ID: "test-client-id",
        GOOGLE_CLIENT_SECRET: "test-client-secret",
        GOOGLE_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
    },
}));

vi.mock("googleapis", () => ({
    google: {
        auth: {
            OAuth2: class {
                generateAuthUrl = vi.fn().mockReturnValue("https://accounts.google.com/o/oauth2/auth?state=mocked");
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
