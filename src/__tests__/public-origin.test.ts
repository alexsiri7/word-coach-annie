import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { publicOrigin } from "@/lib/public-origin";
import { GET as getAuthServerMetadata } from "@/app/.well-known/oauth-authorization-server/route";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("publicOrigin", () => {
    it("prefers APP_BASE_URL, reduced to its origin", () => {
        vi.stubEnv("APP_BASE_URL", "https://annie.example/some/path");
        vi.stubEnv("GOOGLE_REDIRECT_URI", "https://other.example/api/auth/google/callback");
        expect(publicOrigin()).toBe("https://annie.example");
    });

    it("falls back to the origin of GOOGLE_REDIRECT_URI", () => {
        vi.stubEnv("APP_BASE_URL", "");
        vi.stubEnv("GOOGLE_REDIRECT_URI", "https://annie.example/api/auth/google/callback");
        expect(publicOrigin()).toBe("https://annie.example");
    });

    it("throws when neither is configured", () => {
        vi.stubEnv("APP_BASE_URL", "");
        vi.stubEnv("GOOGLE_REDIRECT_URI", "");
        expect(() => publicOrigin()).toThrow(/APP_BASE_URL/);
    });
});

describe("GET /.well-known/oauth-authorization-server", () => {
    it("builds the issuer and every endpoint on the configured origin", async () => {
        vi.stubEnv("APP_BASE_URL", "https://annie.example");

        const metadata = await getAuthServerMetadata().json();

        expect(metadata).toMatchObject({
            issuer: "https://annie.example",
            authorization_endpoint: "https://annie.example/oauth/authorize",
            token_endpoint: "https://annie.example/oauth/token",
            registration_endpoint: "https://annie.example/oauth/register",
        });
    });

    it("ignores forged forwarded-host and host headers", async () => {
        vi.stubEnv("APP_BASE_URL", "https://annie.example");
        const handler: (request: NextRequest) => Response = getAuthServerMetadata;
        const request = new NextRequest("http://evil.example/.well-known/oauth-authorization-server", {
            headers: {
                "x-forwarded-host": "evil.example",
                "x-forwarded-proto": "http",
                host: "evil.example",
            },
        });

        const metadata = await handler(request).json();

        expect(metadata).toMatchObject({
            issuer: "https://annie.example",
            authorization_endpoint: "https://annie.example/oauth/authorize",
            token_endpoint: "https://annie.example/oauth/token",
            registration_endpoint: "https://annie.example/oauth/register",
        });
        expect(JSON.stringify(metadata)).not.toContain("evil.example");
    });
});
