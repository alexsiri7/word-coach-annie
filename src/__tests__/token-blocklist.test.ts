import { Prisma } from "@prisma/client";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
    prisma: {
        revokedToken: {
            create: vi.fn(),
            findUnique: vi.fn(),
        },
    },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { claimToken, revokeToken, isTokenRevoked } from "@/lib/token-blocklist";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

describe("token-blocklist", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete (globalThis as Record<string, unknown>).EdgeRuntime;
    });

    describe("revokeToken", () => {
        it("creates a DB record with provided jti, userId, expiresAt", async () => {
            const exp = new Date();
            await revokeToken("jti-1", "user-1", exp);
            expect(prisma.revokedToken.create).toHaveBeenCalledWith({
                data: { jti: "jti-1", userId: "user-1", expiresAt: exp },
            });
        });

        it("silently ignores P2002 unique constraint (token already revoked)", async () => {
            const p2002 = new Prisma.PrismaClientKnownRequestError(
                "Unique constraint failed on the constraint: `RevokedToken_jti_key`",
                { code: "P2002", clientVersion: "5.0.0", meta: {} }
            );
            vi.mocked(prisma.revokedToken.create).mockRejectedValueOnce(p2002);
            await expect(revokeToken("jti-1", "user-1", new Date())).resolves.toBeUndefined();
            expect(logger.error).not.toHaveBeenCalled();
        });

        it("logs error for non-P2002 DB failures", async () => {
            const dbErr = new Error("Connection refused");
            vi.mocked(prisma.revokedToken.create).mockRejectedValueOnce(dbErr);
            await revokeToken("jti-1", "user-1", new Date());
            expect(logger.error).toHaveBeenCalledWith(
                "[token-blocklist] Failed to revoke token:",
                dbErr
            );
        });

        it("is a no-op in Edge runtime", async () => {
            (globalThis as Record<string, unknown>).EdgeRuntime = "edge";
            await revokeToken("jti-1", "user-1", new Date());
            expect(prisma.revokedToken.create).not.toHaveBeenCalled();
        });
    });

    describe("claimToken", () => {
        it("returns true when the jti is newly claimed", async () => {
            const exp = new Date();
            expect(await claimToken("jti-1", "user-1", exp)).toBe(true);
            expect(prisma.revokedToken.create).toHaveBeenCalledWith({
                data: { jti: "jti-1", userId: "user-1", expiresAt: exp },
            });
        });

        it("returns false when the jti was already claimed (P2002)", async () => {
            const p2002 = new Prisma.PrismaClientKnownRequestError(
                "Unique constraint failed on the constraint: `RevokedToken_jti_key`",
                { code: "P2002", clientVersion: "5.0.0", meta: {} }
            );
            vi.mocked(prisma.revokedToken.create).mockRejectedValueOnce(p2002);
            expect(await claimToken("jti-1", "user-1", new Date())).toBe(false);
        });

        it("fails closed (rejects and logs) on other DB errors", async () => {
            const dbErr = new Error("Connection refused");
            vi.mocked(prisma.revokedToken.create).mockRejectedValueOnce(dbErr);
            await expect(claimToken("jti-1", "user-1", new Date())).rejects.toBe(dbErr);
            expect(logger.error).toHaveBeenCalledWith("[token-blocklist] Failed to claim token:", dbErr);
        });
    });

    describe("isTokenRevoked", () => {
        it("returns true when record found", async () => {
            (prisma.revokedToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
                jti: "jti-1",
            });
            expect(await isTokenRevoked("jti-1")).toBe(true);
        });

        it("returns false when record not found", async () => {
            (prisma.revokedToken.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
            expect(await isTokenRevoked("jti-1")).toBe(false);
        });

        it("fails closed (rejects) when DB throws", async () => {
            const dbErr = new Error("Connection refused");
            (prisma.revokedToken.findUnique as ReturnType<typeof vi.fn>).mockRejectedValueOnce(dbErr);
            await expect(isTokenRevoked("jti-1")).rejects.toBe(dbErr);
        });

        it("returns false in Edge runtime without DB call", async () => {
            (globalThis as Record<string, unknown>).EdgeRuntime = "edge";
            const result = await isTokenRevoked("jti-1");
            expect(result).toBe(false);
            expect(prisma.revokedToken.findUnique).not.toHaveBeenCalled();
        });
    });
});
