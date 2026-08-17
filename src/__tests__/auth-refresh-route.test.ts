import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockVerifySessionTokenNode, mockVerifyRefreshToken, mockCreateSessionToken, mockCreateRefreshToken } = vi.hoisted(() => ({
    mockVerifySessionTokenNode: vi.fn(),
    mockVerifyRefreshToken: vi.fn(),
    mockCreateSessionToken: vi.fn(),
    mockCreateRefreshToken: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
    SESSION_COOKIE_NAME: "annie_session",
    REFRESH_COOKIE_NAME: "annie_refresh",
    SESSION_MAX_AGE: 3600,
    REFRESH_MAX_AGE: 2592000,
}));

vi.mock("@/lib/auth-server", () => ({
    verifySessionTokenNode: mockVerifySessionTokenNode,
    verifyRefreshToken: mockVerifyRefreshToken,
    createSessionToken: mockCreateSessionToken,
    createRefreshToken: mockCreateRefreshToken,
}));

vi.mock("@/lib/token-blocklist", () => ({
    revokeToken: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn() },
}));

import { POST } from "@/app/api/auth/refresh/route";
import { revokeToken } from "@/lib/token-blocklist";

function makeRequest(opts: { sessionCookie?: string; refreshCookie?: string } = {}) {
    const cookies: string[] = [];
    if (opts.sessionCookie !== undefined)
        cookies.push(`annie_session=${opts.sessionCookie}`);
    if (opts.refreshCookie !== undefined)
        cookies.push(`annie_refresh=${opts.refreshCookie}`);
    return new NextRequest("http://localhost/api/auth/refresh", {
        method: "POST",
        headers: cookies.length ? { cookie: cookies.join("; ") } : {},
    });
}

describe("POST /api/auth/refresh", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("no cookies present", () => {
        it("returns 401 when neither session nor refresh cookie is present", async () => {
            const req = makeRequest();
            const res = await POST(req);
            expect(res.status).toBe(401);
            const body = await res.json();
            expect(body.error).toBe("Session expired or revoked");
            expect(mockVerifySessionTokenNode).not.toHaveBeenCalled();
            expect(mockVerifyRefreshToken).not.toHaveBeenCalled();
        });
    });

    describe("path 1: active session renewal", () => {
        it("re-issues session cookie when the session cookie is still valid", async () => {
            const session = { userId: "u1", email: "u@test.com", name: "U", picture: undefined };
            mockVerifySessionTokenNode.mockResolvedValueOnce(session);
            mockCreateSessionToken.mockResolvedValueOnce("fresh-session-jwt");

            const req = makeRequest({ sessionCookie: "valid-session-token" });
            const res = await POST(req);

            expect(res.status).toBe(200);
            expect((await res.json()).ok).toBe(true);
            expect(mockCreateSessionToken).toHaveBeenCalledWith({
                userId: "u1",
                email: "u@test.com",
                name: "U",
                picture: undefined,
            });
            const setCookie = res.headers.get("set-cookie");
            expect(setCookie).toContain("annie_session=fresh-session-jwt");
            expect(setCookie).toContain("HttpOnly");
            expect(setCookie).toContain("Max-Age=3600");
            expect(setCookie?.toLowerCase()).toContain("samesite=lax");
            expect(setCookie).toContain("Path=/");
            // Does NOT try the refresh token path
            expect(mockVerifyRefreshToken).not.toHaveBeenCalled();
        });

        it("returns 500 if session is valid but createSessionToken throws", async () => {
            mockVerifySessionTokenNode.mockResolvedValueOnce({ userId: "u1", email: "u@test.com", name: "U" });
            mockCreateSessionToken.mockRejectedValueOnce(new Error("crypto fail"));

            const req = makeRequest({ sessionCookie: "valid-session-token" });
            const res = await POST(req);
            expect(res.status).toBe(500);
        });
    });

    describe("path 2: cold-return via refresh cookie", () => {
        it("issues a new session and rotated refresh cookie from a valid refresh cookie when session is missing", async () => {
            const refresh = { userId: "u2", email: "u2@test.com", name: "User Two", picture: undefined, jti: "old-jti-2" };
            mockVerifyRefreshToken.mockResolvedValueOnce(refresh);
            mockCreateSessionToken.mockResolvedValueOnce("fresh-session-from-refresh");
            mockCreateRefreshToken.mockResolvedValueOnce("fresh-refresh-token");

            const req = makeRequest({ refreshCookie: "valid-refresh-token" });
            const res = await POST(req);

            expect(res.status).toBe(200);
            expect(mockVerifySessionTokenNode).not.toHaveBeenCalled();
            expect(mockCreateSessionToken).toHaveBeenCalledWith({
                userId: "u2",
                email: "u2@test.com",
                name: "User Two",
                picture: undefined,
            });
            // Old refresh jti should be revoked (rotation)
            expect(revokeToken).toHaveBeenCalledWith("old-jti-2", "u2", expect.any(Date));
            // New refresh token should be issued
            expect(mockCreateRefreshToken).toHaveBeenCalledWith({
                userId: "u2",
                email: "u2@test.com",
                name: "User Two",
                picture: undefined,
            });
            const cookies = res.headers.getSetCookie();
            expect(cookies.some((c: string) => c.includes("annie_session=fresh-session-from-refresh"))).toBe(true);
            const refreshCookieHeader = cookies.find((c: string) => c.startsWith("annie_refresh="));
            expect(refreshCookieHeader).toBeDefined();
            expect(refreshCookieHeader).toContain("fresh-refresh-token");
            expect(refreshCookieHeader?.toLowerCase()).toContain("httponly");
            expect(refreshCookieHeader?.toLowerCase()).toContain("path=/api/auth/");
            expect(refreshCookieHeader?.toLowerCase()).toContain("samesite=lax");
        });

        it("issues a new session cookie from a valid refresh cookie when session is expired", async () => {
            mockVerifySessionTokenNode.mockResolvedValueOnce(null); // expired
            const refresh = { userId: "u3", email: "u3@test.com", name: "U3", picture: undefined, jti: "old-jti-3" };
            mockVerifyRefreshToken.mockResolvedValueOnce(refresh);
            mockCreateSessionToken.mockResolvedValueOnce("fresh-session-from-refresh-v2");
            mockCreateRefreshToken.mockResolvedValueOnce("fresh-refresh-v2");

            const req = makeRequest({ sessionCookie: "expired-token", refreshCookie: "valid-refresh-token" });
            const res = await POST(req);

            expect(res.status).toBe(200);
            const cookies = res.headers.getSetCookie();
            expect(cookies.some((c: string) => c.includes("annie_session=fresh-session-from-refresh-v2"))).toBe(true);
        });

        it("returns 401 when both session and refresh are invalid/revoked", async () => {
            mockVerifySessionTokenNode.mockResolvedValueOnce(null);
            mockVerifyRefreshToken.mockResolvedValueOnce(null);

            const req = makeRequest({ sessionCookie: "bad-session", refreshCookie: "bad-refresh" });
            const res = await POST(req);

            expect(res.status).toBe(401);
            const body = await res.json();
            expect(body.error).toBe("Session expired or revoked");
        });

        it("returns 500 if refresh is valid but createSessionToken throws", async () => {
            mockVerifyRefreshToken.mockResolvedValueOnce({ userId: "u1", email: "u@test.com", name: "U", jti: "jti-err" });
            mockCreateSessionToken.mockRejectedValueOnce(new Error("crypto fail"));

            const req = makeRequest({ refreshCookie: "valid-refresh-token" });
            const res = await POST(req);
            expect(res.status).toBe(500);
        });

        it("propagates picture field from refresh payload", async () => {
            const refresh = {
                userId: "u4",
                email: "u4@test.com",
                name: "U4",
                picture: "https://example.com/pic.jpg",
                jti: "jti-pic",
            };
            mockVerifyRefreshToken.mockResolvedValueOnce(refresh);
            mockCreateSessionToken.mockResolvedValueOnce("jwt");
            mockCreateRefreshToken.mockResolvedValueOnce("refresh-jwt");

            const req = makeRequest({ refreshCookie: "valid-refresh-token" });
            await POST(req);

            expect(mockCreateSessionToken).toHaveBeenCalledWith({
                userId: "u4",
                email: "u4@test.com",
                name: "U4",
                picture: "https://example.com/pic.jpg",
            });
        });

        it("skips revokeToken when refresh payload has no jti", async () => {
            const refresh = { userId: "u5", email: "u5@test.com", name: "U5", picture: undefined };
            // No jti field — should not call revokeToken
            mockVerifyRefreshToken.mockResolvedValueOnce(refresh);
            mockCreateSessionToken.mockResolvedValueOnce("jwt-5");
            mockCreateRefreshToken.mockResolvedValueOnce("refresh-jwt-5");

            const req = makeRequest({ refreshCookie: "valid-refresh-token" });
            const res = await POST(req);

            expect(res.status).toBe(200);
            expect(revokeToken).not.toHaveBeenCalled();
        });
    });
});
