import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { resetRateLimitStore } from "@/lib/rate-limit";

vi.mock("@/lib/oauth-store", () => ({
    registerClient: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/api-auth", () => ({
    getCurrentUserId: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/auth", () => ({
    isAuthEnabled: vi.fn().mockReturnValue(false),
}));

import { isAuthEnabled } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/api-auth";
import { registerClient } from "@/lib/oauth-store";

function makeReq(body: unknown, headers: Record<string, string> = {}) {
    return new NextRequest("http://localhost/oauth/register", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
    });
}

const validBody = {
    redirect_uris: ["https://example.com/cb"],
    client_name: "My App",
};

describe("POST /oauth/register", () => {
    let origDisable: string | undefined;

    beforeEach(() => {
        origDisable = process.env.DISABLE_RATE_LIMIT;
        process.env.DISABLE_RATE_LIMIT = "true"; // disable rate limit unless test re-enables
        vi.clearAllMocks();
        resetRateLimitStore();
    });

    afterEach(() => {
        if (origDisable === undefined) delete process.env.DISABLE_RATE_LIMIT;
        else process.env.DISABLE_RATE_LIMIT = origDisable;
    });

    it("returns 401 invalid_client_metadata when auth is enabled and no session", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        vi.mocked(getCurrentUserId).mockReturnValue(null);
        const { POST } = await import("@/app/oauth/register/route");
        const res = await POST(makeReq(validBody));
        expect(res.status).toBe(401);
        const body = await (res as any).json();
        expect(body.error).toBe("invalid_client_metadata");
        expect(registerClient).not.toHaveBeenCalled();
    });

    it("succeeds when auth is enabled and session is present", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(true);
        vi.mocked(getCurrentUserId).mockReturnValue("u-1");
        const { POST } = await import("@/app/oauth/register/route");
        const res = await POST(makeReq(validBody));
        expect(res.status).toBe(201);
        expect(registerClient).toHaveBeenCalledOnce();
    });

    it("succeeds when auth is disabled (no session required)", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(false);
        const { POST } = await import("@/app/oauth/register/route");
        const res = await POST(makeReq(validBody));
        expect(res.status).toBe(201);
        expect(registerClient).toHaveBeenCalledOnce();
    });

    it("rejects redirect_uris.length > 5 with 400", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(false);
        const { POST } = await import("@/app/oauth/register/route");
        const res = await POST(
            makeReq({
                ...validBody,
                redirect_uris: [
                    "https://a.example/cb",
                    "https://b.example/cb",
                    "https://c.example/cb",
                    "https://d.example/cb",
                    "https://e.example/cb",
                    "https://f.example/cb",
                ],
            })
        );
        expect(res.status).toBe(400);
        const body = await (res as any).json();
        expect(body.error_description).toMatch(/too many redirect_uris/);
        expect(registerClient).not.toHaveBeenCalled();
    });

    it("truncates client_name to 80 chars", async () => {
        vi.mocked(isAuthEnabled).mockReturnValue(false);
        const longName = "x".repeat(200);
        const { POST } = await import("@/app/oauth/register/route");
        const res = await POST(makeReq({ ...validBody, client_name: longName }));
        expect(res.status).toBe(201);
        const body = await (res as any).json();
        expect(body.client_name.length).toBe(80);
    });

    it("rate-limits at 5 per hour per IP", async () => {
        // Re-enable rate limiting just for this test
        delete process.env.DISABLE_RATE_LIMIT;
        vi.mocked(isAuthEnabled).mockReturnValue(false);
        const { POST } = await import("@/app/oauth/register/route");

        const headers = { "x-forwarded-for": "9.9.9.9" };
        for (let i = 0; i < 5; i++) {
            const res = await POST(makeReq(validBody, headers));
            expect(res.status).toBe(201);
        }
        const res = await POST(makeReq(validBody, headers));
        expect(res.status).toBe(429);
        const body = await (res as any).json();
        expect(body.error).toBe("rate_limited");
    });
});
