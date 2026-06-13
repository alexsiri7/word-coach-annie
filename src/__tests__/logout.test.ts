import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/token-blocklist", () => ({
    revokeToken: vi.fn(),
    isTokenRevoked: vi.fn(async () => false),
}));
vi.mock("@/lib/auth", () => ({
    SESSION_COOKIE_NAME: "annie_session",
    SESSION_MAX_AGE: 3600,
    verifySessionToken: vi.fn(async () => ({ userId: "u1", email: "u@test.com", name: "U", jti: "test-jti-123" })),
}));

import { POST } from "@/app/api/auth/logout/route";
import { revokeToken } from "@/lib/token-blocklist";

describe("POST /api/auth/logout", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should revoke the token jti when a valid session cookie is present", async () => {
        const { NextRequest } = await import("next/server");
        const req = new NextRequest("http://localhost/api/auth/logout", {
            method: "POST",
            headers: { cookie: "annie_session=fake-token" },
        });
        const response = await POST(req);
        expect(revokeToken).toHaveBeenCalledWith("test-jti-123", "u1", expect.any(Date));
        expect(response.status).toBe(200);
    });

    it("should still clear the cookie even if revocation fails", async () => {
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

    it("should clear cookie and not attempt revocation when no session cookie present", async () => {
        const { NextRequest } = await import("next/server");
        const req = new NextRequest("http://localhost/api/auth/logout", { method: "POST" });
        const response = await POST(req);
        expect(revokeToken).not.toHaveBeenCalled();
        expect(response.status).toBe(200);
        const setCookie = response.headers.get("set-cookie");
        expect(setCookie).toContain("annie_session=;");
    });
});
