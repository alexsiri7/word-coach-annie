/**
 * Personal API tokens: long-lived bearer credentials a user mints in Settings so another
 * app (e.g. a game's scene editor) can read or edit their scenes as them, or a game's
 * build job can post location snapshots.
 *
 * Verified by src/proxy.ts, which runs on the Node.js runtime. Only the SHA-256 hash of a
 * token is stored; the plaintext exists once, in the create response.
 */
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isEmailAllowed } from "@/lib/auth";

export const PERSONAL_TOKEN_PREFIX = "annie_pat_";

export const PERSONAL_TOKEN_SCOPES = ["read", "write", "snapshots"] as const;
export type PersonalTokenScope = (typeof PERSONAL_TOKEN_SCOPES)[number];

export function isPersonalTokenScope(value: unknown): value is PersonalTokenScope {
    return PERSONAL_TOKEN_SCOPES.includes(value as PersonalTokenScope);
}

/** How stale lastUsedAt may get before a request rewrites it: at most one write per token per minute. */
const LAST_USED_RESOLUTION_MS = 60_000;

export interface PersonalTokenSummary {
    id: string;
    name: string;
    scope: string;
    hint: string;
    createdAt: Date;
    lastUsedAt: Date | null;
}

export interface VerifiedPersonalToken {
    tokenId: string;
    userId: string;
    email: string;
    scope: PersonalTokenScope;
}

const SUMMARY_SELECT = {
    id: true,
    name: true,
    scope: true,
    hint: true,
    createdAt: true,
    lastUsedAt: true,
} as const;

/** SHA-256 needs no salt here: the token carries 256 bits of randomness. */
export function hashPersonalToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export async function createPersonalToken(
    userId: string,
    name: string,
    scope: PersonalTokenScope
): Promise<{ token: string; apiToken: PersonalTokenSummary }> {
    const token = PERSONAL_TOKEN_PREFIX + randomBytes(32).toString("base64url");
    const row = await prisma.apiToken.create({
        data: { userId, name, scope, tokenHash: hashPersonalToken(token), hint: token.slice(-4) },
        select: SUMMARY_SELECT,
    });
    return { token, apiToken: row };
}

export async function listPersonalTokens(userId: string): Promise<PersonalTokenSummary[]> {
    return prisma.apiToken.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: SUMMARY_SELECT,
    });
}

/** Returns false when no token with that id belongs to the user. */
export async function revokePersonalToken(userId: string, id: string): Promise<boolean> {
    const { count } = await prisma.apiToken.deleteMany({ where: { id, userId } });
    return count > 0;
}

/**
 * The identity a token acts as, or null when it is unknown, revoked, belongs to a deleted
 * account or one ALLOWED_EMAILS no longer lists. Fails closed on a database error.
 */
export async function verifyPersonalToken(token: string): Promise<VerifiedPersonalToken | null> {
    if (!token.startsWith(PERSONAL_TOKEN_PREFIX)) return null;
    let row;
    try {
        row = await prisma.apiToken.findUnique({
            where: { tokenHash: hashPersonalToken(token) },
            select: {
                id: true,
                scope: true,
                lastUsedAt: true,
                user: { select: { id: true, email: true } },
            },
        });
    } catch (error) {
        logger.error("Personal API token lookup failed", error);
        return null;
    }
    if (!row || !isEmailAllowed(row.user.email) || !isPersonalTokenScope(row.scope)) return null;

    const now = new Date();
    if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
        try {
            await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: now } });
        } catch (error) {
            logger.warn("Failed to record personal API token use", { tokenId: row.id, error });
        }
    }

    return { tokenId: row.id, userId: row.user.id, email: row.user.email, scope: row.scope };
}

function isUnder(pathname: string, prefix: string): boolean {
    return pathname === prefix || pathname.startsWith(prefix + "/");
}

/** POST /api/projects/{id}/locations/{slug}/snapshots: the one route a snapshots token reaches. */
export const SNAPSHOT_INGEST_PATH = /^\/api\/projects\/[^/]+\/locations\/[^/]+\/snapshots$/;

/**
 * Read and write tokens reach only the scene/node REST routes and the MCP endpoint (whose
 * tools are filtered by scope in createServer); a read token may only GET or HEAD the REST
 * routes. A snapshots token may only post location snapshots.
 */
export function isPersonalTokenRequestAllowed(
    pathname: string,
    method: string,
    scope: PersonalTokenScope
): "ok" | "read-only" | "out-of-scope" {
    if (scope === "snapshots") {
        return method === "POST" && SNAPSHOT_INGEST_PATH.test(pathname) ? "ok" : "out-of-scope";
    }
    if (isUnder(pathname, "/api/mcp")) return "ok";
    if (isUnder(pathname, "/api/nodes")) {
        return method === "GET" || method === "HEAD" || scope === "write" ? "ok" : "read-only";
    }
    return "out-of-scope";
}
