import { describe, it, expect, vi } from "vitest";
import { GoogleAuthController } from "@/lib/controllers/google-auth";
import { testPrisma } from "./setup";

// Mock googleapis to avoid needing real credentials
vi.mock("googleapis", () => ({
    google: {
        auth: {
            OAuth2: class {
                generateAuthUrl = vi.fn().mockReturnValue("https://accounts.google.com/auth?test=1");
                getToken = vi.fn().mockResolvedValue({
                    tokens: {
                        access_token: "test-access-token",
                        refresh_token: "test-refresh-token",
                        expiry_date: Date.now() + 3600000,
                        scope: "https://www.googleapis.com/auth/documents"
                    }
                });
                setCredentials = vi.fn();
                on = vi.fn();
            },
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
            const status = await GoogleAuthController.getStatus(null);
            expect(status.connected).toBe(false);
        });

        it("returns connected with credentials", async () => {
            await testPrisma.googleCredential.create({
                data: {
                    userId: "local",
                    accessToken: "test-token",
                    refreshToken: "test-refresh",
                    expiresAt: new Date(Date.now() + 3600000),
                    scope: "test-scope"
                }
            });

            const status = await GoogleAuthController.getStatus(null);
            expect(status.connected).toBe(true);
            expect(status.isExpired).toBe(false);
        });

        it("returns expired status for expired token", async () => {
            await testPrisma.googleCredential.create({
                data: {
                    userId: "local",
                    accessToken: "test-token",
                    refreshToken: "test-refresh",
                    expiresAt: new Date(Date.now() - 3600000), // expired
                    scope: "test-scope"
                }
            });

            const status = await GoogleAuthController.getStatus(null);
            expect(status.connected).toBe(true);
            expect(status.isExpired).toBe(true);
        });

        it("scopes status to the requesting user", async () => {
            await testPrisma.googleCredential.create({
                data: {
                    userId: "user-A",
                    accessToken: "token-a",
                    refreshToken: "refresh-a",
                    expiresAt: new Date(Date.now() + 3600000),
                    scope: "test-scope"
                }
            });

            const statusA = await GoogleAuthController.getStatus("user-A");
            const statusB = await GoogleAuthController.getStatus("user-B");

            expect(statusA.connected).toBe(true);
            expect(statusB.connected).toBe(false);
        });
    });

    describe("handleCallback", () => {
        it("stores credentials from OAuth callback", async () => {
            await GoogleAuthController.handleCallback("test-code", undefined, null);

            const cred = await testPrisma.googleCredential.findUnique({ where: { userId: "local" } });
            expect(cred).not.toBeNull();
            expect(cred!.accessToken).toBe("test-access-token");
            expect(cred!.refreshToken).toBe("test-refresh-token");
        });

        it("replaces existing credentials for the same user only", async () => {
            await testPrisma.googleCredential.create({
                data: {
                    userId: "local",
                    accessToken: "old-token",
                    refreshToken: "old-refresh",
                    expiresAt: new Date(),
                    scope: "old-scope"
                }
            });

            await GoogleAuthController.handleCallback("test-code", undefined, null);

            const creds = await testPrisma.googleCredential.findMany();
            expect(creds).toHaveLength(1);
            expect(creds[0].accessToken).toBe("test-access-token");
            expect(creds[0].userId).toBe("local");
        });

        it("does not replace credentials belonging to other users", async () => {
            await testPrisma.googleCredential.create({
                data: {
                    userId: "user-B",
                    accessToken: "user-b-token",
                    refreshToken: "user-b-refresh",
                    expiresAt: new Date(Date.now() + 3600000),
                    scope: "test-scope"
                }
            });

            // User A connects — must NOT delete user B's credentials
            await GoogleAuthController.handleCallback("test-code", undefined, "user-A");

            const credB = await testPrisma.googleCredential.findUnique({ where: { userId: "user-B" } });
            expect(credB).not.toBeNull();
            expect(credB!.accessToken).toBe("user-b-token");

            const credA = await testPrisma.googleCredential.findUnique({ where: { userId: "user-A" } });
            expect(credA).not.toBeNull();
            expect(credA!.accessToken).toBe("test-access-token");
        });
    });

    describe("getValidClient", () => {
        it("returns null when no credentials", async () => {
            const client = await GoogleAuthController.getValidClient(null);
            expect(client).toBeNull();
        });

        it("returns client when credentials exist", async () => {
            await testPrisma.googleCredential.create({
                data: {
                    userId: "local",
                    accessToken: "test-token",
                    refreshToken: "test-refresh",
                    expiresAt: new Date(Date.now() + 3600000),
                    scope: "test-scope"
                }
            });

            const client = await GoogleAuthController.getValidClient(null);
            expect(client).not.toBeNull();
        });

        it("returns null for a different user with no credentials", async () => {
            await testPrisma.googleCredential.create({
                data: {
                    userId: "user-A",
                    accessToken: "token-a",
                    refreshToken: "refresh-a",
                    expiresAt: new Date(Date.now() + 3600000),
                    scope: "test-scope"
                }
            });

            const client = await GoogleAuthController.getValidClient("user-B");
            expect(client).toBeNull();
        });
    });

    describe("disconnect", () => {
        it("removes credentials for the specified user only", async () => {
            await testPrisma.googleCredential.createMany({
                data: [
                    {
                        userId: "user-A",
                        accessToken: "token-a",
                        refreshToken: "refresh-a",
                        expiresAt: new Date(),
                        scope: "test-scope"
                    },
                    {
                        userId: "user-B",
                        accessToken: "token-b",
                        refreshToken: "refresh-b",
                        expiresAt: new Date(),
                        scope: "test-scope"
                    }
                ]
            });

            // Disconnect user A — must NOT touch user B
            await GoogleAuthController.disconnect("user-A");

            const credA = await testPrisma.googleCredential.findUnique({ where: { userId: "user-A" } });
            const credB = await testPrisma.googleCredential.findUnique({ where: { userId: "user-B" } });

            expect(credA).toBeNull();
            expect(credB).not.toBeNull();
        });

        it("removes local credentials when userId is null", async () => {
            await testPrisma.googleCredential.create({
                data: {
                    userId: "local",
                    accessToken: "test-token",
                    refreshToken: "test-refresh",
                    expiresAt: new Date(),
                    scope: "test-scope"
                }
            });

            await GoogleAuthController.disconnect(null);

            const creds = await testPrisma.googleCredential.findMany();
            expect(creds).toHaveLength(0);
        });
    });
});
