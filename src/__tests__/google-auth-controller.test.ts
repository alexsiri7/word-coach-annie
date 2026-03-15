import { describe, it, expect, vi, beforeEach } from "vitest";
import { GoogleAuthController } from "@/lib/controllers/google-auth";
import { testPrisma } from "./setup";

// Mock googleapis to avoid needing real credentials
vi.mock("googleapis", () => ({
    google: {
        auth: {
            OAuth2: vi.fn().mockImplementation(() => ({
                generateAuthUrl: vi.fn().mockReturnValue("https://accounts.google.com/auth?test=1"),
                getToken: vi.fn().mockResolvedValue({
                    tokens: {
                        access_token: "test-access-token",
                        refresh_token: "test-refresh-token",
                        expiry_date: Date.now() + 3600000,
                        scope: "https://www.googleapis.com/auth/documents"
                    }
                }),
                setCredentials: vi.fn(),
                on: vi.fn(),
            })),
        },
    },
}));

describe("GoogleAuthController", () => {
    describe("getAuthUrl", () => {
        it("returns an auth URL", () => {
            const url = GoogleAuthController.getAuthUrl();
            expect(url).toContain("https://accounts.google.com");
        });
    });

    describe("getStatus", () => {
        it("returns disconnected when no credentials", async () => {
            const status = await GoogleAuthController.getStatus();
            expect(status.connected).toBe(false);
        });

        it("returns connected with credentials", async () => {
            await testPrisma.googleCredential.create({
                data: {
                    accessToken: "test-token",
                    refreshToken: "test-refresh",
                    expiresAt: new Date(Date.now() + 3600000),
                    scope: "test-scope"
                }
            });

            const status = await GoogleAuthController.getStatus();
            expect(status.connected).toBe(true);
            expect(status.isExpired).toBe(false);
        });

        it("returns expired status for expired token", async () => {
            await testPrisma.googleCredential.create({
                data: {
                    accessToken: "test-token",
                    refreshToken: "test-refresh",
                    expiresAt: new Date(Date.now() - 3600000), // expired
                    scope: "test-scope"
                }
            });

            const status = await GoogleAuthController.getStatus();
            expect(status.connected).toBe(true);
            expect(status.isExpired).toBe(true);
        });
    });

    describe("handleCallback", () => {
        it("stores credentials from OAuth callback", async () => {
            await GoogleAuthController.handleCallback("test-code");

            const cred = await testPrisma.googleCredential.findFirst();
            expect(cred).not.toBeNull();
            expect(cred!.accessToken).toBe("test-access-token");
            expect(cred!.refreshToken).toBe("test-refresh-token");
        });

        it("replaces existing credentials", async () => {
            await testPrisma.googleCredential.create({
                data: {
                    accessToken: "old-token",
                    refreshToken: "old-refresh",
                    expiresAt: new Date(),
                    scope: "old-scope"
                }
            });

            await GoogleAuthController.handleCallback("test-code");

            const creds = await testPrisma.googleCredential.findMany();
            expect(creds).toHaveLength(1);
            expect(creds[0].accessToken).toBe("test-access-token");
        });
    });

    describe("getValidClient", () => {
        it("returns null when no credentials", async () => {
            const client = await GoogleAuthController.getValidClient();
            expect(client).toBeNull();
        });

        it("returns client when credentials exist", async () => {
            await testPrisma.googleCredential.create({
                data: {
                    accessToken: "test-token",
                    refreshToken: "test-refresh",
                    expiresAt: new Date(Date.now() + 3600000),
                    scope: "test-scope"
                }
            });

            const client = await GoogleAuthController.getValidClient();
            expect(client).not.toBeNull();
        });
    });

    describe("disconnect", () => {
        it("removes all credentials", async () => {
            await testPrisma.googleCredential.create({
                data: {
                    accessToken: "test-token",
                    refreshToken: "test-refresh",
                    expiresAt: new Date(),
                    scope: "test-scope"
                }
            });

            await GoogleAuthController.disconnect();

            const creds = await testPrisma.googleCredential.findMany();
            expect(creds).toHaveLength(0);
        });
    });
});
