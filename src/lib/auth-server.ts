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

export interface RefreshPayload {
    userId: string;
    email: string;
    name: string;
    picture?: string;
    jti?: string;
}

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

        if (result.jti) {
            try {
                if (await isTokenRevoked(result.jti)) return null;
            } catch (blocklistErr) {
                // DB unavailable — fail-closed: reject the token rather than accept it with unknown revocation status
                logger.error("verifyRefreshToken: blocklist check failed, rejecting token as precaution", blocklistErr);
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

export async function verifySessionTokenNode(token: string) {
    const session = await verifySessionToken(token);
    if (!session) return null;
    try {
        if (session.jti && (await isTokenRevoked(session.jti))) return null;
    } catch (err) {
        logger.error("verifySessionTokenNode: unexpected error checking blocklist", err);
        return null; // fail-safe: treat as unverifiable
    }
    return session;
}
