import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

const mockHandleCallback = vi.fn();
const mockGetCurrentUserId = vi.fn().mockReturnValue("user-1");

vi.mock("@/lib/controllers/google-auth", () => ({
    GoogleAuthController: { handleCallback: mockHandleCallback },
}));

vi.mock("@/lib/api-auth", () => ({
    getCurrentUserId: mockGetCurrentUserId,
}));

vi.mock("@/lib/env", () => ({
    env: {
        GOOGLE_CLIENT_ID: "test-client-id",
        GOOGLE_CLIENT_SECRET: "test-client-secret",
        GOOGLE_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
    },
}));

vi.mock("@/lib/auth", () => ({
    resolveJwtSecret: vi.fn().mockReturnValue("annie-dev-secret"),
    safeEqual: vi.fn().mockImplementation((a: string, b: string) => a === b),
}));

vi.mock("@/lib/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn() },
}));

function makeSignedState(nonce = "test-nonce") {
    const sig = crypto.createHmac("sha256", "annie-dev-secret").update(nonce).digest("hex").slice(0, 16);
    return `${nonce}.${sig}`;
}

function makeRequest(state: string, cookieState: string, code = "test-code") {
    const url = new URL(`http://localhost:3000/api/auth/google-docs/callback`);
    url.searchParams.set("code", code);
    url.searchParams.set("state", state);
    return new NextRequest(url, {
        headers: new Headers({ cookie: `google_docs_oauth_state=${cookieState}` }),
    });
}

describe("GET /api/auth/google-docs/callback — HMAC state verification", () => {
    beforeEach(() => vi.clearAllMocks());

    it("redirects to /settings?google_docs=connected on valid state", async () => {
        mockHandleCallback.mockResolvedValue(undefined);
        const state = makeSignedState();
        const { GET } = await import("@/app/api/auth/google-docs/callback/route");
        const response = await GET(makeRequest(state, state));
        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toContain("/settings?google_docs=connected");
    });

    it("redirects with invalid_state when HMAC sig is tampered", async () => {
        const tamperedState = "test-nonce.0000000000000000";
        const { GET } = await import("@/app/api/auth/google-docs/callback/route");
        const { safeEqual } = await import("@/lib/auth");
        const response = await GET(makeRequest(tamperedState, tamperedState));
        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toContain("google_docs_error=invalid_state");
        expect(safeEqual).toHaveBeenCalledOnce();
    });

    it("redirects with invalid_state when state has no dot separator", async () => {
        const noDotState = "nodothere";
        const { GET } = await import("@/app/api/auth/google-docs/callback/route");
        const response = await GET(makeRequest(noDotState, noDotState));
        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toContain("google_docs_error=invalid_state");
    });

    it("logs a warning on HMAC mismatch", async () => {
        const tamperedState = "test-nonce.0000000000000000";
        const { GET } = await import("@/app/api/auth/google-docs/callback/route");
        const { logger } = await import("@/lib/logger");
        await GET(makeRequest(tamperedState, tamperedState));
        expect(logger.warn).toHaveBeenCalledWith(
            "Google Docs OAuth HMAC state verification failed — possible CSRF or replay attempt"
        );
    });

    it("redirects with invalid_state when state/cookie mismatch", async () => {
        const { GET } = await import("@/app/api/auth/google-docs/callback/route");
        const state = makeSignedState();
        const differentCookieState = makeSignedState("other-nonce");
        const response = await GET(makeRequest(state, differentCookieState));
        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toContain("google_docs_error=invalid_state");
    });

    it("redirects with missing_code when code is absent", async () => {
        const { GET } = await import("@/app/api/auth/google-docs/callback/route");
        const state = makeSignedState();
        const url = new URL("http://localhost:3000/api/auth/google-docs/callback");
        url.searchParams.set("state", state);
        const req = new NextRequest(url, {
            headers: new Headers({ cookie: `google_docs_oauth_state=${state}` }),
        });
        const response = await GET(req);
        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toContain("google_docs_error=missing_code");
    });
});
