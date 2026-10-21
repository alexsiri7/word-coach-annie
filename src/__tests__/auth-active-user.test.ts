import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
    prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/token-blocklist", () => ({ isTokenRevoked: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { getActiveUser, isEmailAllowed } from "@/lib/auth-server";
import { prisma } from "@/lib/db";

const row = { id: "u1", email: "Writer@Test.com", name: "Writer", picture: null };

describe("isEmailAllowed / getActiveUser", () => {
    const original = process.env.ALLOWED_EMAILS;

    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.ALLOWED_EMAILS;
    });

    afterEach(() => {
        if (original === undefined) delete process.env.ALLOWED_EMAILS;
        else process.env.ALLOWED_EMAILS = original;
    });

    describe("isEmailAllowed", () => {
        it("allows everyone when ALLOWED_EMAILS is unset", () => {
            expect(isEmailAllowed("anyone@test.com")).toBe(true);
        });

        it("matches listed emails case- and whitespace-insensitively", () => {
            process.env.ALLOWED_EMAILS = "other@test.com, WRITER@test.com ";
            expect(isEmailAllowed("writer@TEST.com")).toBe(true);
        });

        it("rejects emails missing from the list", () => {
            process.env.ALLOWED_EMAILS = "other@test.com";
            expect(isEmailAllowed("writer@test.com")).toBe(false);
        });
    });

    describe("getActiveUser", () => {
        it("returns the identity from the user row", async () => {
            vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(row as never);
            expect(await getActiveUser("u1")).toEqual({
                userId: "u1",
                email: "Writer@Test.com",
                name: "Writer",
                picture: undefined,
            });
            expect(prisma.user.findUnique).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: "u1" } })
            );
        });

        it("returns null when the user row no longer exists", async () => {
            vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
            expect(await getActiveUser("deleted")).toBeNull();
        });

        it("returns null when the user's email is no longer allowed", async () => {
            process.env.ALLOWED_EMAILS = "other@test.com";
            vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(row as never);
            expect(await getActiveUser("u1")).toBeNull();
        });

        it("propagates DB errors so callers fail closed", async () => {
            const dbErr = new Error("Connection refused");
            vi.mocked(prisma.user.findUnique).mockRejectedValueOnce(dbErr);
            await expect(getActiveUser("u1")).rejects.toBe(dbErr);
        });
    });
});
