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
import { env } from "@/lib/env";

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
 * Get the JWT signing key. Uses API_TOKEN, ENCRYPTION_KEY, or a fallback.
 * Returns a CryptoKey suitable for jose sign/verify.
 */
async function getJwtKey(): Promise<CryptoKey> {
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

/**
 * Validate that a post-login redirect destination is an allowed app path.
 * Accepts only same-origin paths that match known user-facing routes.
 * Rejects cross-origin attempts, protocol injections, and unknown paths.
 */
export function isAllowedRedirect(path: string): boolean {
    if (!path || typeof path !== "string") return false;
    if (!path.startsWith("/") || path.startsWith("//")) return false;
    if (path.includes("\\")) return false;

    const [pathname] = path.split("?");
    if (pathname.includes(":")) return false; // blocks javascript: and http:

    const ALLOWED_PATTERNS = [
        /^\/$/,
        /^\/settings(\/.*)?$/,
        /^\/setup(\/.*)?$/,
        /^\/project\/[a-zA-Z0-9_-]+(\/.*)?$/,
        /^\/read\/[a-zA-Z0-9_-]+(\/.*)?$/,
        /^\/universe(\/[a-zA-Z0-9_-]+(\/.*)?)?$/,
    ];

    return ALLOWED_PATTERNS.some((re) => re.test(pathname));
}
