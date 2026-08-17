import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/token-blocklist", () => ({
    revokeToken: vi.fn(),
    isTokenRevoked: vi.fn(async () => false),
}));

const { mockVerifySessionTokenNode, mockVerifyRefreshToken } = vi.hoisted(() => ({
    mockVerifySessionTokenNode: vi.fn(async () => ({
        userId: "u1",
        email: "u@test.com",
        name: "U",
        jti: "test-jti-123",
    })) as any,
    mockVerifyRefreshToken: vi.fn(async () => null) as any,
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
}));

import { POST } from "@/app/api/auth/logout/route";
import { revokeToken } from "@/lib/token-blocklist";

describe("POST /api/auth/logout", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockVerifySessionTokenNode.mockResolvedValue({
            userId: "u1",
            email: "u@test.com",
            name: "U",
            jti: "test-jti-123",
        });
        mockVerifyRefreshToken.mockResolvedValue(null);
    });

    it("should revoke the session token jti when a valid session cookie is present", async () => {
        const { NextRequest } = await import("next/server");
        const req = new NextRequest("http://localhost/api/auth/logout", {
            method: "POST",
            headers: { cookie: "annie_session=fake-token" },
        });
        const response = await POST(req);
        expect(revokeToken).toHaveBeenCalledWith("test-jti-123", "u1", expect.any(Date));
        expect(response.status).toBe(200);
    });

    it("should revoke the refresh token jti when a valid refresh cookie is present", async () => {
        mockVerifySessionTokenNode.mockResolvedValueOnce(null);
        mockVerifyRefreshToken.mockResolvedValueOnce({
            userId: "u1",
            email: "u@test.com",
            name: "U",
            jti: "refresh-jti-456",
        });
        const { NextRequest } = await import("next/server");
        const req = new NextRequest("http://localhost/api/auth/logout", {
            method: "POST",
            headers: { cookie: "annie_session=expired; annie_refresh=refresh-token" },
        });
        const response = await POST(req);
        expect(revokeToken).toHaveBeenCalledWith("refresh-jti-456", "u1", expect.any(Date));
        expect(response.status).toBe(200);
    });

    it("should still clear cookies even if session revocation fails", async () => {
        (revokeToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("DB down"));
        const { NextRequest } = await import("next/server");
        const req = new NextRequest("http://localhost/api/auth/logout", {
            method: "POST",
            headers: { cookie: "annie_session=fake-token" },
        });
        const response = await POST(req);
        expect(response.status).toBe(200);
        const setCookie = response.headers.get("set-cookie");
        expect(setCookie).toContain("annie_session=;");
    });

    it("should clear both session and refresh cookies on logout", async () => {
        const { NextRequest } = await import("next/server");
        const req = new NextRequest("http://localhost/api/auth/logout", {
            method: "POST",
            headers: { cookie: "annie_session=fake-token" },
        });
        const response = await POST(req);
        expect(response.status).toBe(200);
        const setCookie = response.headers.get("set-cookie");
        expect(setCookie).toContain("annie_session=;");
        expect(setCookie).toContain("annie_refresh=;");
    });

    it("should revoke both session and refresh token jtis when both cookies are present", async () => {
        mockVerifySessionTokenNode.mockResolvedValueOnce({
            userId: "u1",
            email: "u@test.com",
            name: "U",
            jti: "session-jti-789",
        });
        mockVerifyRefreshToken.mockResolvedValueOnce({
            userId: "u1",
            email: "u@test.com",
            name: "U",
            jti: "refresh-jti-101",
        });
        const { NextRequest } = await import("next/server");
        const req = new NextRequest("http://localhost/api/auth/logout", {
            method: "POST",
            headers: { cookie: "annie_session=valid-session; annie_refresh=valid-refresh" },
        });
        const response = await POST(req);
        expect(response.status).toBe(200);
        expect(revokeToken).toHaveBeenCalledTimes(2);
        expect(revokeToken).toHaveBeenCalledWith("session-jti-789", "u1", expect.any(Date));
        expect(revokeToken).toHaveBeenCalledWith("refresh-jti-101", "u1", expect.any(Date));
    });

    it("should clear cookies and not attempt revocation when no cookies are present", async () => {
        mockVerifySessionTokenNode.mockResolvedValueOnce(null);
        const { NextRequest } = await import("next/server");
        const req = new NextRequest("http://localhost/api/auth/logout", { method: "POST" });
        const response = await POST(req);
        expect(revokeToken).not.toHaveBeenCalled();
        expect(response.status).toBe(200);
        const setCookie = response.headers.get("set-cookie");
        expect(setCookie).toContain("annie_session=;");
    });
});
