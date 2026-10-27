import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GoogleAuthController } from "@/lib/controllers/google-auth";
import { decrypt, encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
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

    describe("ENCRYPTION_KEY rotation", () => {
        const KEY_A = "google-rotation-key-a";
        const KEY_B = "google-rotation-key-b";
        let origEncKey: string | undefined;
        let origPrevious: string | undefined;

        beforeEach(async () => {
            origEncKey = process.env.ENCRYPTION_KEY;
            origPrevious = process.env.ENCRYPTION_KEY_PREVIOUS;
            process.env.ENCRYPTION_KEY = KEY_A;
            delete process.env.ENCRYPTION_KEY_PREVIOUS;
            await testPrisma.googleCredential.create({
                data: {
                    userId: "local",
                    accessToken: encrypt("access-under-a"),
                    refreshToken: encrypt("refresh-under-a"),
                    expiresAt: new Date(Date.now() + 3600000),
                    scope: "test-scope"
                }
            });
        });

        afterEach(() => {
            if (origEncKey !== undefined) process.env.ENCRYPTION_KEY = origEncKey;
            else delete process.env.ENCRYPTION_KEY;
            if (origPrevious !== undefined) process.env.ENCRYPTION_KEY_PREVIOUS = origPrevious;
            else delete process.env.ENCRYPTION_KEY_PREVIOUS;
        });

        it("reads tokens under a previous key and rewrites them under the current key", async () => {
            process.env.ENCRYPTION_KEY = KEY_B;
            process.env.ENCRYPTION_KEY_PREVIOUS = KEY_A;

            const client = await GoogleAuthController.getValidClient(null);
            expect(client).not.toBeNull();

            delete process.env.ENCRYPTION_KEY_PREVIOUS;
            const cred = await testPrisma.googleCredential.findUniqueOrThrow({ where: { userId: "local" } });
            expect(decrypt(cred.accessToken)).toBe("access-under-a");
            expect(decrypt(cred.refreshToken)).toBe("refresh-under-a");
        });

        it("does not overwrite a token refreshed between the read and the rewrite", async () => {
            const stale = await testPrisma.googleCredential.findUniqueOrThrow({ where: { userId: "local" } });
            process.env.ENCRYPTION_KEY = KEY_B;
            process.env.ENCRYPTION_KEY_PREVIOUS = KEY_A;
            const refreshed = encrypt("access-refreshed-meanwhile");
            await testPrisma.googleCredential.update({ where: { userId: "local" }, data: { accessToken: refreshed } });

            const staleRead = vi.spyOn(prisma.googleCredential, "findUnique").mockResolvedValueOnce(stale as never);
            try {
                await GoogleAuthController.getValidClient(null);
            } finally {
                staleRead.mockRestore();
            }

            const cred = await testPrisma.googleCredential.findUniqueOrThrow({ where: { userId: "local" } });
            expect(cred.accessToken).toBe(refreshed);
            delete process.env.ENCRYPTION_KEY_PREVIOUS;
            expect(decrypt(cred.refreshToken)).toBe("refresh-under-a");
        });

        it("still reports connected when ENCRYPTION_KEY is unset", async () => {
            delete process.env.ENCRYPTION_KEY;
            delete process.env.ALLOW_PLAINTEXT_STORAGE;
            try {
                await expect(GoogleAuthController.getStatus(null)).resolves.toMatchObject({ connected: true });
            } finally {
                process.env.ALLOW_PLAINTEXT_STORAGE = "true";
            }
        });

        it("reports tokens no configured key decrypts as disconnected without throwing or deleting them", async () => {
            process.env.ENCRYPTION_KEY = KEY_B;
            const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

            await expect(GoogleAuthController.getStatus(null)).resolves.toEqual({ connected: false });
            await expect(GoogleAuthController.getValidClient(null)).resolves.toBeNull();
            expect(await testPrisma.googleCredential.count({ where: { userId: "local" } })).toBe(1);
            warn.mockRestore();
        });
    });
});
