import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

vi.mock("@/lib/env", () => ({
    env: {
        GOOGLE_CLIENT_ID: "test-client-id",
        GOOGLE_CLIENT_SECRET: "test-client-secret",
        GOOGLE_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
    },
}));

vi.mock("@/lib/controllers/google-auth", () => ({
    GoogleAuthController: {
        getAuthUrl: vi.fn().mockReturnValue("https://accounts.google.com/o/oauth2/auth"),
    },
}));

vi.mock("@/lib/auth", () => ({
    resolveJwtSecret: vi.fn().mockReturnValue("annie-dev-secret"),
}));

vi.mock("@/lib/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn() },
}));

describe("GET /api/auth/google-docs — signed state format", () => {
    it("sets a google_docs_oauth_state cookie with nonce.sig format", async () => {
        const { GET } = await import("@/app/api/auth/google-docs/route");
        const req = new NextRequest("http://localhost:3000/api/auth/google-docs");
        const response = await GET(req);

        expect(response.status).toBe(307);
        const setCookies = response.headers.getSetCookie();
        const stateCookie = setCookies.find((c) => c.startsWith("google_docs_oauth_state="));
        expect(stateCookie).toBeDefined();

        const cookieValue = stateCookie!.split(";")[0].replace("google_docs_oauth_state=", "");
        // Format must be "nonce.sig" where sig is 16 hex chars
        expect(cookieValue).toMatch(/^[^.]+\.[0-9a-f]{16}$/);

        // Verify sig is HMAC-SHA256(nonce, secret).slice(0, 16)
        const [nonce, sig] = cookieValue.split(".");
        const expectedSig = crypto
            .createHmac("sha256", "annie-dev-secret")
            .update(nonce)
            .digest("hex")
            .slice(0, 16);
        expect(sig).toBe(expectedSig);
    });

    it("redirects to the Google auth URL", async () => {
        const { GET } = await import("@/app/api/auth/google-docs/route");
        const req = new NextRequest("http://localhost:3000/api/auth/google-docs");
        const response = await GET(req);

        expect(response.status).toBe(307);
        const location = response.headers.get("location") ?? "";
        expect(location).toBeTruthy();
        expect(location).toContain("accounts.google.com");
    });
});
