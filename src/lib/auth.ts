/**
 * Authentication utilities.
 *
 * Supports two auth modes:
 * 1. API_TOKEN — static token for programmatic/MCP access + legacy session cookie
 * 2. Google OAuth — JWT session cookie with user identity
 *
 * When neither API_TOKEN nor GOOGLE_CLIENT_ID is set, auth is disabled (local dev).
 */
import { SignJWT, jwtVerify, errors as JoseErrors } from "jose";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const SESSION_COOKIE_NAME = "annie_session";
const REFRESH_COOKIE_NAME = "annie_refresh";
const SESSION_MAX_AGE = 60 * 60; // 1 hour — Edge Runtime cannot check blocklist; short lifetime is the compensating control
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days — long-lived refresh token, verified only in Node.js (blocklist checked)

export { SESSION_COOKIE_NAME, REFRESH_COOKIE_NAME, SESSION_MAX_AGE, REFRESH_MAX_AGE };

export const JWT_ISSUER = "word-coach-annie";
export const JWT_AUDIENCE_SESSION = "word-coach-annie:session";
export const JWT_AUDIENCE_REFRESH = "word-coach-annie:refresh";

/** JWT payload shape for Google OAuth sessions. */
export interface SessionPayload {
    userId: string;
    email: string;
    name: string;
    picture?: string;
    jti?: string; // present on tokens created after the blocklist was added
}

/**
 * Resolve the raw JWT secret string.
 * Falls back to "annie-dev-secret" only when auth is disabled (local dev).
 * Throws if auth is enabled but no secret is configured.
 */
export function resolveJwtSecret(): string {
    // Use only JWT_SECRET — do not reuse API_TOKEN or ENCRYPTION_KEY as a JWT seed.
    // Those serve distinct purposes and reuse allows key-confusion attacks.
    const secret = env.JWT_SECRET;
    if (secret) return secret;
    if (isAuthEnabled()) {
        throw new Error(
            "JWT_SECRET is required when auth is enabled. " +
            "Set JWT_SECRET to a random string of at least 32 characters."
        );
    }
    return "annie-dev-secret";
}

/**
 * Get the JWT signing key derived from JWT_SECRET (via resolveJwtSecret).
 * Returns a CryptoKey suitable for jose sign/verify.
 */
export async function getJwtKey(): Promise<CryptoKey> {
    const secret = resolveJwtSecret();
    const encoder = new TextEncoder();
    return crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
    );
}

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
            const { isTokenRevoked } = await import("@/lib/token-blocklist");
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
 * Create a signed JWT for a user session.
 * Sets iss=JWT_ISSUER and aud=JWT_AUDIENCE_SESSION; verifySessionToken enforces both.
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
    const key = await getJwtKey();
    return new SignJWT({ ...payload })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer(JWT_ISSUER)
        .setAudience(JWT_AUDIENCE_SESSION)
        .setIssuedAt()
        .setExpirationTime(`${SESSION_MAX_AGE}s`)
        .setJti(crypto.randomUUID())
        .sign(key);
}

/**
 * Verify and decode a JWT session token.
 * Returns the payload if valid, null if invalid/expired.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
    try {
        const key = await getJwtKey();
        const { payload } = await jwtVerify(token, key, {
            algorithms: ["HS256"],
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE_SESSION,
        });
        if (payload.userId && payload.email) {
            const session: SessionPayload = {
                userId: payload.userId as string,
                email: payload.email as string,
                name: (payload.name as string) || "",
                picture: payload.picture as string | undefined,
                jti: payload.jti as string | undefined,
            };

            // Check revocation blocklist in Node.js contexts.
            // Edge runtime (middleware) skips this — short token lifetime is the compensating control.
            if (session.jti && typeof (globalThis as Record<string, unknown>).EdgeRuntime === "undefined") {
                const { isTokenRevoked } = await import("@/lib/token-blocklist");
                if (await isTokenRevoked(session.jti)) {
                    return null;
                }
            }

            return session;
        }
        return null;
    } catch (err) {
        // Expected: expired, tampered, wrong issuer/audience/algorithm — treat as invalid.
        if (err instanceof JoseErrors.JOSEError) {
            return null;
        }
        // Unexpected: infrastructure failure (missing key, crypto error).
        logger.error("verifySessionToken: unexpected error during JWT verification", err);
        return null;
    }
}

/**
 * Derive a session token from the API token using SHA-256.
 * This is the legacy API_TOKEN session cookie (non-JWT).
 * Uses Web Crypto API (available in Edge Runtime and Node.js).
 */
export async function deriveSessionToken(apiToken: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode("annie-session:" + apiToken);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Constant-time string comparison to prevent timing attacks on secrets.
 * Returns false when lengths differ (no timing info leaks there).
 * Pure JS implementation — works in Edge Runtime (no node:crypto).
 */
export function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

/** Check if auth is configured at all (any auth mode). */
export function isAuthEnabled(): boolean {
    return !!(env.API_TOKEN || env.GOOGLE_CLIENT_ID);
}

/** Returns true when Google OAuth is the active auth mode (multi-user deployments where every request must carry a user identity). */
export function isGoogleAuthMode(): boolean {
    return !!env.GOOGLE_CLIENT_ID;
}

const ALLOWED_REDIRECT_PATTERNS = [
    /^\/$/,
    /^\/settings(\/.*)?$/,
    /^\/setup(\/.*)?$/,
    /^\/project\/[a-zA-Z0-9_-]+(\/.*)?$/,
    /^\/read\/[a-zA-Z0-9_-]+(\/.*)?$/,
    /^\/universe(\/[a-zA-Z0-9_-]+(\/.*)?)?$/,
    /^\/oauth\/authorize$/,
];

/**
 * Validate that a post-login redirect destination is an allowed app path.
 * Accepts only same-origin paths that match known user-facing routes.
 * Rejects cross-origin attempts, protocol injections, and unknown paths.
 */
export function isAllowedRedirect(path: string): boolean {
    if (!path) return false;
    if (!path.startsWith("/") || path.startsWith("//")) return false;
    if (path.includes("\\")) return false;

    const [pathname] = path.split("?");
    if (pathname.includes(":")) return false; // blocks javascript: and http:

    return ALLOWED_REDIRECT_PATTERNS.some((re) => re.test(pathname));
}
