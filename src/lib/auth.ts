/**
 * Authentication utilities.
 *
 * Supports two auth modes:
 * 1. API_TOKEN — static token for programmatic/MCP access + legacy session cookie
 * 2. Google OAuth — JWT session cookie with user identity
 *
 * When neither API_TOKEN nor GOOGLE_CLIENT_ID is set, auth is disabled (local dev).
 */
import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE_NAME = "annie_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE };

/** JWT payload shape for Google OAuth sessions. */
export interface SessionPayload {
    userId: string;
    email: string;
    name: string;
    picture?: string;
}

/**
 * Get the JWT signing key. Uses API_TOKEN, ENCRYPTION_KEY, or a fallback.
 * Returns a CryptoKey suitable for jose sign/verify.
 */
async function getJwtKey(): Promise<CryptoKey> {
    const secret = process.env.JWT_SECRET || process.env.API_TOKEN || process.env.ENCRYPTION_KEY || "annie-dev-secret";
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
 * Create a signed JWT for a user session.
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
    const key = await getJwtKey();
    return new SignJWT({ ...payload })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_MAX_AGE}s`)
        .sign(key);
}

/**
 * Verify and decode a JWT session token.
 * Returns the payload if valid, null if invalid/expired.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
    try {
        const key = await getJwtKey();
        const { payload } = await jwtVerify(token, key);
        if (payload.userId && payload.email) {
            return {
                userId: payload.userId as string,
                email: payload.email as string,
                name: (payload.name as string) || "",
                picture: payload.picture as string | undefined,
            };
        }
        return null;
    } catch {
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

/** Check if auth is configured at all (any auth mode). */
export function isAuthEnabled(): boolean {
    return !!(process.env.API_TOKEN || process.env.GOOGLE_CLIENT_ID);
}
