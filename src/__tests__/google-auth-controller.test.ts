import { describe, it, expect, vi } from "vitest";
import { GoogleAuthController } from "@/lib/controllers/google-auth";
import { testPrisma } from "./setup";

// Track the most recently constructed OAuth2 mock instance so tests can inspect it.
let lastOAuth2Instance: { removeAllListeners: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> } | null = null;

// Mock googleapis to avoid needing real credentials
vi.mock("googleapis", () => ({
    google: {
        auth: {
            OAuth2: class {
                removeAllListeners = vi.fn();
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
                constructor() {
                    lastOAuth2Instance = this as unknown as typeof lastOAuth2Instance;
                }
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

        it("removes previous 'tokens' listener before adding a new one", async () => {
            await testPrisma.googleCredential.create({
                data: {
                    userId: "local",
                    accessToken: "test-token",
                    refreshToken: "test-refresh",
                    expiresAt: new Date(Date.now() + 3600000),
                    scope: "test-scope"
                }
            });

            await GoogleAuthController.getValidClient(null);

            const instance = lastOAuth2Instance!;
            expect(instance.removeAllListeners).toHaveBeenCalledWith("tokens");
            expect(instance.on).toHaveBeenCalledWith("tokens", expect.any(Function));
            // removeAllListeners must be called before on
            expect(instance.removeAllListeners.mock.invocationCallOrder[0])
                .toBeLessThan(instance.on.mock.invocationCallOrder[0]);
        });

        it("does not accumulate listeners across multiple getValidClient calls", async () => {
            await testPrisma.googleCredential.create({
                data: {
                    userId: "local",
                    accessToken: "test-token",
                    refreshToken: "test-refresh",
                    expiresAt: new Date(Date.now() + 3600000),
                    scope: "test-scope"
                }
            });

            await GoogleAuthController.getValidClient(null);
            const firstInstance = lastOAuth2Instance!;

            await GoogleAuthController.getValidClient(null);
            const secondInstance = lastOAuth2Instance!;

            // Each call creates a fresh client — each must clear then attach exactly once
            expect(firstInstance.removeAllListeners).toHaveBeenCalledTimes(1);
            expect(firstInstance.on).toHaveBeenCalledTimes(1);
            expect(secondInstance.removeAllListeners).toHaveBeenCalledTimes(1);
            expect(secondInstance.on).toHaveBeenCalledTimes(1);
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
