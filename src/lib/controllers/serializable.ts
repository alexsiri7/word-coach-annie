import { Prisma } from "@prisma/client";
import { prisma, type DbClient } from "@/lib/db";
import { logger } from "@/lib/logger";
import { UserFacingError } from "@/lib/controllers/errors";

/**
 * Runs a read-then-write transaction at Serializable isolation, so two overlapping
 * edits cannot both act on the same read; the loser of a race is told to retry.
 */
export async function runSerializable<T>(
    logLabel: string,
    conflictMessage: string,
    target: Record<string, string>,
    fn: (tx: DbClient) => Promise<T>,
): Promise<T> {
    try {
        return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
            logger.warn(logLabel, target);
            throw new UserFacingError(conflictMessage);
        }
        throw e;
    }
}
