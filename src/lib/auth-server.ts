/**
 * Server-only authentication utilities.
 *
 * Node.js ONLY — do NOT import this file in Edge Runtime (middleware) or
 * client components. It imports from token-blocklist → db → pg, all of which
 * require Node.js built-ins.
 *
 * Edge-safe functions (JWT creation/verification without DB) live in auth.ts.
 */
import { isTokenRevoked } from "@/lib/token-blocklist";
import {
    verifySessionToken,
    getJwtKey,
    JWT_ISSUER,
    JWT_AUDIENCE_REFRESH,
    REFRESH_MAX_AGE,
} from "@/lib/auth";
import { SignJWT, jwtVerify, errors as JoseErrors } from "jose";
import { logger } from "@/lib/logger";

export type { SessionPayload } from "@/lib/auth";
export { createSessionToken } from "@/lib/auth";

/**
 * Payload shape for long-lived refresh tokens.
 * Carries user identity so the refresh endpoint can mint new session tokens
 * without a database round-trip.
 */
export interface RefreshPayload {
    userId: string;
    email: string;
    name: string;
    picture?: string;
    jti?: string;
}

/**
 * Create a signed JWT for a long-lived refresh token (30 days).
 * Sets iss=JWT_ISSUER and aud=JWT_AUDIENCE_REFRESH.
 * Must only be verified in Node.js (blocklist check runs there).
 */
export async function createRefreshToken(payload: RefreshPayload): Promise<string> {
    const key = await getJwtKey();
    return new SignJWT({ ...payload })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer(JWT_ISSUER)
        .setAudience(JWT_AUDIENCE_REFRESH)
        .setIssuedAt()
        .setExpirationTime(`${REFRESH_MAX_AGE}s`)
        .setJti(crypto.randomUUID())
        .sign(key);
}

/**
 * Verify a refresh token. Returns the payload if valid, null otherwise.
 * Always checks the revocation blocklist (Node.js only — never call from Edge).
 */
export async function verifyRefreshToken(token: string): Promise<RefreshPayload | null> {
    try {
        const key = await getJwtKey();
        const { payload } = await jwtVerify(token, key, {
            algorithms: ["HS256"],
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE_REFRESH,
        });
        if (!payload.userId || !payload.email) return null;

        const result: RefreshPayload = {
            userId: payload.userId as string,
            email: payload.email as string,
            name: (payload.name as string) || "",
            picture: payload.picture as string | undefined,
            jti: payload.jti as string | undefined,
        };

        // Blocklist check — refresh tokens are only verified in Node.js routes.
        if (result.jti) {
            if (await isTokenRevoked(result.jti)) {
                return null;
            }
        }

        return result;
    } catch (err) {
        if (err instanceof JoseErrors.JOSEError) return null;
        logger.error("verifyRefreshToken: unexpected error", err);
        return null;
    }
}

/**
 * Verify a session token AND check the revocation blocklist.
 * Use this in Node.js API routes where revocation must be enforced.
 * Do NOT use in Edge Runtime (middleware) — use verifySessionToken from auth.ts instead.
 */
export async function verifySessionTokenNode(token: string) {
    const session = await verifySessionToken(token);
    if (!session) return null;

    if (session.jti) {
        if (await isTokenRevoked(session.jti)) {
            return null;
        }
    }

    return session;
}
