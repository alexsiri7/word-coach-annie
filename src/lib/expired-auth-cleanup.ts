/**
 * Periodic deletion of expired RevokedToken and OAuthAuthCode rows.
 *
 * Every RevokedToken.expiresAt is at or after the revoked JWT's own `exp`,
 * which `jwtVerify` enforces, so an expired row no longer blocks anything.
 */
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export async function pruneExpiredAuthRows(now: Date = new Date()): Promise<void> {
    try {
        const [tokens, codes] = await Promise.all([
            prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: now } } }),
            prisma.oAuthAuthCode.deleteMany({ where: { expiresAt: { lt: now } } }),
        ]);
        logger.info("[expired-auth-cleanup] Pruned expired rows", {
            revokedTokens: tokens.count,
            oauthAuthCodes: codes.count,
        });
    } catch (err) {
        logger.error("[expired-auth-cleanup] Failed to prune expired rows:", err);
    }
}

/** Runs once at startup, then hourly; the timer never keeps the process alive. */
export function startExpiredAuthCleanup(): void {
    void pruneExpiredAuthRows();
    setInterval(() => void pruneExpiredAuthRows(), CLEANUP_INTERVAL_MS).unref();
}
