import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/auth/me/route";
import { createLegacySessionCookie, SESSION_MAX_AGE } from "@/lib/auth";

const API_TOKEN = "me-route-token";

function meRequest(cookie: string): NextRequest {
    return new NextRequest("http://localhost/api/auth/me", { headers: { cookie: `annie_session=${cookie}` } });
}

describe("GET /api/auth/me with a legacy API_TOKEN session cookie", () => {
    let origApiToken: string | undefined;
    let origJwtSecret: string | undefined;

    beforeEach(() => {
        origApiToken = process.env.API_TOKEN;
        origJwtSecret = process.env.JWT_SECRET;
        process.env.API_TOKEN = API_TOKEN;
        process.env.JWT_SECRET = "me-route-jwt-secret-0123456789abcdef";
    });

    afterEach(() => {
        if (origApiToken !== undefined) process.env.API_TOKEN = origApiToken;
        else delete process.env.API_TOKEN;
        if (origJwtSecret !== undefined) process.env.JWT_SECRET = origJwtSecret;
        else delete process.env.JWT_SECRET;
    });

    it("reports an anonymous authenticated session for a fresh cookie", async () => {
        const res = await GET(meRequest(await createLegacySessionCookie(API_TOKEN)));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ authenticated: true, user: null });
    });

    it("rejects a cookie older than SESSION_MAX_AGE", async () => {
        const issued = Date.now() - (SESSION_MAX_AGE + 60) * 1000;
        const res = await GET(meRequest(await createLegacySessionCookie(API_TOKEN, issued)));
        expect(res.status).toBe(401);
    });

    it("rejects a tampered cookie", async () => {
        const cookie = await createLegacySessionCookie(API_TOKEN);
        const tampered = cookie.slice(0, -1) + (cookie.endsWith("0") ? "1" : "0");
        expect((await GET(meRequest(tampered))).status).toBe(401);
    });

    it("rejects a cookie issued before API_TOKEN was rotated", async () => {
        const res = await GET(meRequest(await createLegacySessionCookie("previous-token")));
        expect(res.status).toBe(401);
    });

    it("rejects the old deterministic session value", async () => {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("annie-session:" + API_TOKEN));
        const legacy = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
        expect((await GET(meRequest(legacy))).status).toBe(401);
    });
});
