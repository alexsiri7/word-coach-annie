import { Prisma } from "@prisma/client";
import type { MappedError } from "@prisma/driver-adapter-utils";
import { prisma, type DbClient } from "@/lib/db";
import { logger } from "@/lib/logger";
import { UserFacingError } from "@/lib/controllers/errors";

/**
 * Whether a Serializable transaction lost a race (Postgres 40001/40P01) and was rolled back.
 * Prisma wraps the conflict as P2034 when a statement inside the transaction fails, but a
 * conflict raised by COMMIT itself reaches the caller as the raw adapter error. The adapter
 * error is matched by shape, as in src/lib/db-retry.ts: its class lives in a transitive dependency.
 */
export function isSerializationConflict(e: unknown): boolean {
    if (e instanceof Prisma.PrismaClientKnownRequestError) return e.code === "P2034";
    if (!(e instanceof Error) || e.name !== "DriverAdapterError") return false;
    const cause = (e as { cause?: unknown }).cause;
    return typeof cause === "object" && cause !== null && (cause as { kind?: MappedError["kind"] }).kind === "TransactionWriteConflict";
}

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
        if (isSerializationConflict(e)) {
            logger.warn(logLabel, target);
            throw new UserFacingError(conflictMessage);
        }
        throw e;
    }
}
