/**
 * Token revocation blocklist backed by the Prisma database.
 *
 * Node.js only — do NOT import this in Edge Runtime (middleware).
 * Use the same guard pattern as src/lib/rate-limit.ts:
 *   if (typeof EdgeRuntime !== "undefined") return false;
 */
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

function isEdgeRuntime(): boolean {
    return typeof (globalThis as Record<string, unknown>).EdgeRuntime !== "undefined";
}

/**
 * Add a jti to the revocation blocklist.
 * No-op in Edge runtime (should be called from logout route, which is Node.js).
 */
export async function revokeToken(jti: string, userId: string, expiresAt: Date): Promise<void> {
    if (isEdgeRuntime()) return;
    try {
        await prisma.revokedToken.create({ data: { jti, userId, expiresAt } });
    } catch (err) {
        // Unique constraint violation means it's already revoked — that's fine
        logger.error("[token-blocklist] Failed to revoke token:", err);
    }
}

/**
 * Check whether a jti has been revoked.
 * Returns false in Edge runtime (fail-open; middleware relies on short token lifetime instead).
 */
export async function isTokenRevoked(jti: string): Promise<boolean> {
    if (isEdgeRuntime()) return false;
    try {
        const record = await prisma.revokedToken.findUnique({ where: { jti } });
        return record !== null;
    } catch (err) {
        logger.error("[token-blocklist] Revocation check failed, allowing:", err);
        return false; // fail-open
    }
}
