import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { prisma } from "@/lib/db";
import { UserFacingError } from "@/lib/controllers/errors";
import { isSerializationConflict, runSerializable } from "@/lib/controllers/serializable";

/** The shape `@prisma/driver-adapter-utils` raises: message plus the mapped payload as `cause`. */
function driverAdapterError(kind: string) {
    return Object.assign(new Error(kind), { name: "DriverAdapterError", cause: { kind } });
}

describe("isSerializationConflict", () => {
    it("matches a conflict Prisma wrapped as P2034", () => {
        expect(isSerializationConflict(new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "test" }))).toBe(true);
    });

    it("matches a conflict raised by COMMIT, which reaches the caller unwrapped", () => {
        expect(isSerializationConflict(driverAdapterError("TransactionWriteConflict"))).toBe(true);
    });

    it("does not match other failures", () => {
        expect(isSerializationConflict(new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" }))).toBe(false);
        expect(isSerializationConflict(driverAdapterError("ConnectionClosed"))).toBe(false);
        expect(isSerializationConflict(new Error("Connection terminated unexpectedly"))).toBe(false);
    });
});

describe("runSerializable", () => {
    it("tells the loser of a commit-time conflict to retry", async () => {
        vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(driverAdapterError("TransactionWriteConflict"));
        const run = runSerializable("label", "please try again", {}, async () => "never");
        await expect(run).rejects.toThrow(UserFacingError);
    });
});
