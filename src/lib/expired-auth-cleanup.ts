/**
 * Periodic deletion of expired RevokedToken and OAuthAuthCode rows, and of
 * OAuthClient registration IPs once the per-IP registration window has passed.
 *
 * Every RevokedToken.expiresAt is at or after the revoked JWT's own `exp`,
 * which `jwtVerify` enforces, so an expired row no longer blocks anything.
 * A registration IP is only read by the per-IP limit's rolling window, so the
 * IP is cleared and the client row itself is kept.
 */
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { IP_WINDOW_MS } from "@/lib/oauth-store";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export async function pruneExpiredAuthRows(now: Date = new Date()): Promise<void> {
    try {
        const [tokens, codes, clientIps] = await Promise.all([
            prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: now } } }),
            prisma.oAuthAuthCode.deleteMany({ where: { expiresAt: { lt: now } } }),
            prisma.oAuthClient.updateMany({
                where: {
                    createdAt: { lt: new Date(now.getTime() - IP_WINDOW_MS) },
                    registrationIp: { not: null },
                },
                data: { registrationIp: null },
            }),
        ]);
        logger.info("[expired-auth-cleanup] Pruned expired rows", {
            revokedTokens: tokens.count,
            oauthAuthCodes: codes.count,
            oauthClientIps: clientIps.count,
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
