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

import { revokeToken, isTokenRevoked } from "@/lib/token-blocklist";
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
            const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
            (prisma.revokedToken.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(p2002);
            await expect(revokeToken("jti-1", "user-1", new Date())).resolves.toBeUndefined();
            expect(logger.error).not.toHaveBeenCalled();
        });

        it("logs error for non-P2002 DB failures", async () => {
            const dbErr = new Error("Connection refused");
            (prisma.revokedToken.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(dbErr);
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

        it("fails open (returns false) when DB throws", async () => {
            (prisma.revokedToken.findUnique as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
                new Error("Connection refused")
            );
            expect(await isTokenRevoked("jti-1")).toBe(false);
        });

        it("returns false in Edge runtime without DB call", async () => {
            (globalThis as Record<string, unknown>).EdgeRuntime = "edge";
            const result = await isTokenRevoked("jti-1");
            expect(result).toBe(false);
            expect(prisma.revokedToken.findUnique).not.toHaveBeenCalled();
        });
    });
});
