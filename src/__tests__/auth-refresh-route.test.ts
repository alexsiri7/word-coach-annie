import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockVerifySessionTokenNode, mockVerifyRefreshTokenClaims, mockCreateSessionToken, mockCreateRefreshToken, mockGetActiveUser } = vi.hoisted(() => ({
    mockVerifySessionTokenNode: vi.fn(),
    mockVerifyRefreshTokenClaims: vi.fn(),
    mockCreateSessionToken: vi.fn(),
    mockCreateRefreshToken: vi.fn(),
    mockGetActiveUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
    SESSION_COOKIE_NAME: "annie_session",
    REFRESH_COOKIE_NAME: "annie_refresh",
    SESSION_MAX_AGE: 3600,
    REFRESH_MAX_AGE: 2592000,
}));

vi.mock("@/lib/auth-server", () => ({
    verifySessionTokenNode: mockVerifySessionTokenNode,
    verifyRefreshTokenClaims: mockVerifyRefreshTokenClaims,
    createSessionToken: mockCreateSessionToken,
    createRefreshToken: mockCreateRefreshToken,
    getActiveUser: mockGetActiveUser,
}));

vi.mock("@/lib/token-blocklist", () => ({
    claimToken: vi.fn(),
    isTokenFamilyRevoked: vi.fn(),
    revokeFamilyOnReuse: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn() },
}));

import { POST } from "@/app/api/auth/refresh/route";
import { claimToken, isTokenFamilyRevoked, revokeFamilyOnReuse } from "@/lib/token-blocklist";

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
        vi.mocked(claimToken).mockResolvedValue(true);
        vi.mocked(isTokenFamilyRevoked).mockResolvedValue(false);
        vi.mocked(revokeFamilyOnReuse).mockResolvedValue(false);
    });

    /** Verify `payload` as the presented token and return the same identity from the User row. */
    function activeUser(verify: typeof mockVerifySessionTokenNode, payload: { userId: string; email: string; name: string; picture?: string; jti?: string; familyId?: string }) {
        verify.mockResolvedValueOnce(payload);
        const { userId, email, name, picture } = payload;
        mockGetActiveUser.mockResolvedValueOnce({ userId, email, name, picture });
    }

    describe("no cookies present", () => {
        it("returns 401 when neither session nor refresh cookie is present", async () => {
            const req = makeRequest();
            const res = await POST(req);
            expect(res.status).toBe(401);
            const body = await res.json();
            expect(body.error).toBe("Session expired or revoked");
            expect(mockVerifySessionTokenNode).not.toHaveBeenCalled();
            expect(mockVerifyRefreshTokenClaims).not.toHaveBeenCalled();
        });
    });

    describe("path 1: active session renewal", () => {
        it("re-issues session cookie when the session cookie is still valid", async () => {
            activeUser(mockVerifySessionTokenNode, { userId: "u1", email: "u@test.com", name: "U", picture: undefined });
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
            expect(mockVerifyRefreshTokenClaims).not.toHaveBeenCalled();
        });

        it("returns 401 when the session's user is deleted or no longer allowed", async () => {
            mockVerifySessionTokenNode.mockResolvedValueOnce({ userId: "gone", email: "g@test.com", name: "G" });
            mockGetActiveUser.mockResolvedValueOnce(null);

            const res = await POST(makeRequest({ sessionCookie: "valid-session-token" }));

            expect(res.status).toBe(401);
            expect(mockCreateSessionToken).not.toHaveBeenCalled();
            expect(mockVerifyRefreshTokenClaims).not.toHaveBeenCalled();
        });

        it("mints the session from the current user row, not the stale session claims", async () => {
            mockVerifySessionTokenNode.mockResolvedValueOnce({ userId: "u3", email: "old@test.com", name: "Old" });
            const current = { userId: "u3", email: "new@test.com", name: "New", picture: "https://example.com/new.jpg" };
            mockGetActiveUser.mockResolvedValueOnce(current);
            mockCreateSessionToken.mockResolvedValueOnce("jwt-3");

            const res = await POST(makeRequest({ sessionCookie: "valid-session-token" }));

            expect(res.status).toBe(200);
            expect(mockGetActiveUser).toHaveBeenCalledWith("u3");
            expect(mockCreateSessionToken).toHaveBeenCalledWith(current);
        });

        it("returns 500 if session is valid but createSessionToken throws", async () => {
            activeUser(mockVerifySessionTokenNode, { userId: "u1", email: "u@test.com", name: "U" });
            mockCreateSessionToken.mockRejectedValueOnce(new Error("crypto fail"));

            const req = makeRequest({ sessionCookie: "valid-session-token" });
            const res = await POST(req);
            expect(res.status).toBe(500);
        });
    });

    describe("path 2: cold-return via refresh cookie", () => {
        it("issues a new session and rotated refresh cookie from a valid refresh cookie when session is missing", async () => {
            const refresh = { userId: "u2", email: "u2@test.com", name: "User Two", picture: undefined, jti: "old-jti-2", familyId: "fam-2" };
            activeUser(mockVerifyRefreshTokenClaims, refresh);
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
                familyId: "fam-2",
            });
            // Old refresh jti is atomically claimed (rotation)
            expect(claimToken).toHaveBeenCalledWith("old-jti-2", "u2", expect.any(Date));
            // New refresh token stays in the presented token's family
            expect(mockCreateRefreshToken).toHaveBeenCalledWith({
                userId: "u2",
                email: "u2@test.com",
                name: "User Two",
                picture: undefined,
                familyId: "fam-2",
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
            activeUser(mockVerifyRefreshTokenClaims, refresh);
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
            mockVerifyRefreshTokenClaims.mockResolvedValueOnce(null);

            const req = makeRequest({ sessionCookie: "bad-session", refreshCookie: "bad-refresh" });
            const res = await POST(req);

            expect(res.status).toBe(401);
            const body = await res.json();
            expect(body.error).toBe("Session expired or revoked");
        });

        it("returns 500 if refresh is valid but createSessionToken throws", async () => {
            activeUser(mockVerifyRefreshTokenClaims, { userId: "u1", email: "u@test.com", name: "U", jti: "jti-err" });
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
                familyId: "fam-pic",
            };
            activeUser(mockVerifyRefreshTokenClaims, refresh);
            mockCreateSessionToken.mockResolvedValueOnce("jwt");
            mockCreateRefreshToken.mockResolvedValueOnce("refresh-jwt");

            const req = makeRequest({ refreshCookie: "valid-refresh-token" });
            await POST(req);

            expect(mockCreateSessionToken).toHaveBeenCalledWith({
                userId: "u4",
                email: "u4@test.com",
                name: "U4",
                picture: "https://example.com/pic.jpg",
                familyId: "fam-pic",
            });
        });

        it("skips claimToken when refresh payload has no jti", async () => {
            const refresh = { userId: "u5", email: "u5@test.com", name: "U5", picture: undefined };
            activeUser(mockVerifyRefreshTokenClaims, refresh);
            mockCreateSessionToken.mockResolvedValueOnce("jwt-5");
            mockCreateRefreshToken.mockResolvedValueOnce("refresh-jwt-5");

            const req = makeRequest({ refreshCookie: "valid-refresh-token" });
            const res = await POST(req);

            expect(res.status).toBe(200);
            expect(claimToken).not.toHaveBeenCalled();
        });

        it("returns 401 without claiming or minting when the user is deleted or no longer allowed", async () => {
            mockVerifyRefreshTokenClaims.mockResolvedValueOnce({ userId: "gone", email: "g@test.com", name: "G", jti: "jti-gone" });
            mockGetActiveUser.mockResolvedValueOnce(null);

            const res = await POST(makeRequest({ refreshCookie: "valid-refresh-token" }));

            expect(res.status).toBe(401);
            expect(claimToken).not.toHaveBeenCalled();
            expect(mockCreateSessionToken).not.toHaveBeenCalled();
            expect(mockCreateRefreshToken).not.toHaveBeenCalled();
        });

        it("returns 401 without minting when the refresh jti was already claimed (reuse)", async () => {
            activeUser(mockVerifyRefreshTokenClaims, { userId: "u6", email: "u6@test.com", name: "U6", jti: "jti-reused" });
            vi.mocked(claimToken).mockResolvedValueOnce(false);

            const res = await POST(makeRequest({ refreshCookie: "valid-refresh-token" }));

            expect(res.status).toBe(401);
            expect(mockCreateSessionToken).not.toHaveBeenCalled();
            expect(mockCreateRefreshToken).not.toHaveBeenCalled();
        });

        it("returns 500 without minting when claimToken throws", async () => {
            activeUser(mockVerifyRefreshTokenClaims, { userId: "u7", email: "u7@test.com", name: "U7", jti: "jti-db" });
            vi.mocked(claimToken).mockRejectedValueOnce(new Error("Connection refused"));

            const res = await POST(makeRequest({ refreshCookie: "valid-refresh-token" }));

            expect(res.status).toBe(500);
            expect(mockCreateSessionToken).not.toHaveBeenCalled();
        });

        it("returns 500 when the user lookup throws", async () => {
            mockVerifyRefreshTokenClaims.mockResolvedValueOnce({ userId: "u8", email: "u8@test.com", name: "U8", jti: "jti-8" });
            mockGetActiveUser.mockRejectedValueOnce(new Error("Connection refused"));

            const res = await POST(makeRequest({ refreshCookie: "valid-refresh-token" }));

            expect(res.status).toBe(500);
            expect(claimToken).not.toHaveBeenCalled();
        });

        it("mints tokens from the current user row, not the stale token claims", async () => {
            mockVerifyRefreshTokenClaims.mockResolvedValueOnce({ userId: "u9", email: "old@test.com", name: "Old", jti: "jti-9", familyId: "fam-9" });
            const current = { userId: "u9", email: "new@test.com", name: "New", picture: "https://example.com/new.jpg" };
            mockGetActiveUser.mockResolvedValueOnce(current);
            mockCreateSessionToken.mockResolvedValueOnce("jwt-9");
            mockCreateRefreshToken.mockResolvedValueOnce("refresh-jwt-9");

            const res = await POST(makeRequest({ refreshCookie: "valid-refresh-token" }));

            expect(res.status).toBe(200);
            expect(mockCreateSessionToken).toHaveBeenCalledWith({ ...current, familyId: "fam-9" });
            expect(mockCreateRefreshToken).toHaveBeenCalledWith({ ...current, familyId: "fam-9" });
        });

        it("starts a family for a legacy refresh token that has none, shared by both new tokens", async () => {
            activeUser(mockVerifyRefreshTokenClaims, { userId: "u10", email: "u10@test.com", name: "U10", jti: "jti-10" });
            mockCreateSessionToken.mockResolvedValueOnce("jwt-10");
            mockCreateRefreshToken.mockResolvedValueOnce("refresh-jwt-10");

            const res = await POST(makeRequest({ refreshCookie: "valid-refresh-token" }));

            expect(res.status).toBe(200);
            const sessionFamily = mockCreateSessionToken.mock.calls[0][0].familyId;
            expect(sessionFamily).toEqual(expect.any(String));
            expect(mockCreateRefreshToken.mock.calls[0][0].familyId).toBe(sessionFamily);
        });
    });

    describe("token family revocation (#1578)", () => {
        it("returns 401 without claiming or minting when the refresh token's family is revoked", async () => {
            activeUser(mockVerifyRefreshTokenClaims, { userId: "u11", email: "u11@test.com", name: "U11", jti: "jti-11", familyId: "fam-11" });
            vi.mocked(isTokenFamilyRevoked).mockResolvedValueOnce(true);

            const res = await POST(makeRequest({ refreshCookie: "valid-refresh-token" }));

            expect(res.status).toBe(401);
            expect(isTokenFamilyRevoked).toHaveBeenCalledWith("fam-11");
            expect(claimToken).not.toHaveBeenCalled();
            expect(mockCreateSessionToken).not.toHaveBeenCalled();
            expect(mockCreateRefreshToken).not.toHaveBeenCalled();
        });

        it("hands a reused refresh token to family revocation and returns 401 without minting", async () => {
            activeUser(mockVerifyRefreshTokenClaims, { userId: "u12", email: "u12@test.com", name: "U12", jti: "jti-12", familyId: "fam-12" });
            vi.mocked(claimToken).mockResolvedValueOnce(false);
            vi.mocked(revokeFamilyOnReuse).mockResolvedValueOnce(true);

            const res = await POST(makeRequest({ refreshCookie: "valid-refresh-token" }));

            expect(res.status).toBe(401);
            expect(revokeFamilyOnReuse).toHaveBeenCalledWith("jti-12", "fam-12", "u12", expect.any(Date));
            expect(mockCreateSessionToken).not.toHaveBeenCalled();
            expect(mockCreateRefreshToken).not.toHaveBeenCalled();
        });

        it("returns 500 without minting when the reuse lookup throws", async () => {
            activeUser(mockVerifyRefreshTokenClaims, { userId: "u13", email: "u13@test.com", name: "U13", jti: "jti-13", familyId: "fam-13" });
            vi.mocked(claimToken).mockResolvedValueOnce(false);
            vi.mocked(revokeFamilyOnReuse).mockRejectedValueOnce(new Error("Connection refused"));

            const res = await POST(makeRequest({ refreshCookie: "valid-refresh-token" }));

            expect(res.status).toBe(500);
            expect(mockCreateSessionToken).not.toHaveBeenCalled();
        });

        it("returns 500 without minting when the family check throws", async () => {
            activeUser(mockVerifyRefreshTokenClaims, { userId: "u14", email: "u14@test.com", name: "U14", jti: "jti-14", familyId: "fam-14" });
            vi.mocked(isTokenFamilyRevoked).mockRejectedValueOnce(new Error("Connection refused"));

            const res = await POST(makeRequest({ refreshCookie: "valid-refresh-token" }));

            expect(res.status).toBe(500);
            expect(claimToken).not.toHaveBeenCalled();
            expect(mockCreateSessionToken).not.toHaveBeenCalled();
        });

        it("re-issues an active session in the same family", async () => {
            activeUser(mockVerifySessionTokenNode, { userId: "u15", email: "u15@test.com", name: "U15", familyId: "fam-15" });
            mockCreateSessionToken.mockResolvedValueOnce("jwt-15");

            const res = await POST(makeRequest({ sessionCookie: "valid-session-token" }));

            expect(res.status).toBe(200);
            expect(mockCreateSessionToken).toHaveBeenCalledWith(expect.objectContaining({ familyId: "fam-15" }));
        });
    });
});
