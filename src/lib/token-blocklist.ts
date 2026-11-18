/**
 * Token revocation blocklist backed by the Prisma database.
 *
 * Node.js only — do NOT import this in Edge Runtime (middleware).
 * Use the `isEdgeRuntime()` helper defined below for the guard pattern.
 */
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

function isEdgeRuntime(): boolean {
    return typeof (globalThis as Record<string, unknown>).EdgeRuntime !== "undefined";
}

/**
 * Atomically claim a jti for single-use enforcement.
 *
 * Attempts to insert the jti into the revocation blocklist before any new
 * tokens are issued. Returns true if the slot was successfully claimed
 * (proceed to issue tokens), or false if the jti already exists (P2002 —
 * token already used or a concurrent replay attempt).
 *
 * Fail-closed: throws on unexpected DB errors; callers must treat a throw
 * as a server error, never as permission to issue tokens. No-op in Edge runtime.
 */
export async function claimToken(jti: string, userId: string, expiresAt: Date): Promise<boolean> {
    if (isEdgeRuntime()) return true; // fail-open in edge
    try {
        await prisma.revokedToken.create({ data: { jti, userId, expiresAt } });
        return true; // successfully claimed — proceed to issue tokens
    } catch (err) {
        if ((err as { code?: string }).code === "P2002") return false; // already claimed = token reused
        logger.error("[token-blocklist] Failed to claim token:", err);
        throw err;
    }
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
        // P2002 = unique constraint: token already revoked — idempotent, ignore.
        // Any other error is unexpected; log at ERROR for on-call visibility.
        if ((err as { code?: string }).code !== "P2002") {
            logger.error("[token-blocklist] Failed to revoke token:", err);
        }
    }
}

/**
 * Check whether a jti has been revoked.
 * Throws on DB errors (fail-closed); callers must reject the token on a throw.
 * Returns false in Edge runtime (middleware relies on short token lifetime instead).
 */
export async function isTokenRevoked(jti: string): Promise<boolean> {
    if (isEdgeRuntime()) return false;
    try {
        const record = await prisma.revokedToken.findUnique({ where: { jti } });
        return record !== null;
    } catch (err) {
        logger.error("[token-blocklist] Revocation check failed, rejecting:", err);
        throw err;
    }
}

/**
 * Two concurrent uses of one refresh token — e.g. two tabs renewing together —
 * land within this window of the first claim and are not treated as theft.
 */
export const REFRESH_REUSE_GRACE_MS = 30_000;

const familyKey = (familyId: string) => `family:${familyId}`;

/** Check whether a token family (one login's lineage) has been revoked. Fail-closed like isTokenRevoked. */
export async function isTokenFamilyRevoked(familyId: string): Promise<boolean> {
    return isTokenRevoked(familyKey(familyId));
}

/**
 * Called after claimToken returned false for `jti`. If that jti was claimed
 * longer than REFRESH_REUSE_GRACE_MS ago, the token chain has forked (a stolen
 * copy is in play), so revoke its whole family until `expiresAt`, which must
 * outlive every family member. Returns true when the family was revoked.
 * Throws on DB errors; callers reject the request either way.
 */
export async function revokeFamilyOnReuse(
    jti: string,
    familyId: string | undefined,
    userId: string,
    expiresAt: Date
): Promise<boolean> {
    if (isEdgeRuntime() || !familyId) return false;
    let claim;
    try {
        claim = await prisma.revokedToken.findUnique({ where: { jti }, select: { revokedAt: true } });
    } catch (err) {
        logger.error("[token-blocklist] Reuse lookup failed:", err);
        throw err;
    }
    if (!claim || Date.now() - claim.revokedAt.getTime() < REFRESH_REUSE_GRACE_MS) return false;
    // Either claim outcome leaves the family revoked; a false only means a concurrent caller got there first.
    await claimToken(familyKey(familyId), userId, expiresAt);
    return true;
}
