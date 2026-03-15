/**
 * Authentication utilities for single-user API protection.
 *
 * When API_TOKEN is set, all /api/* routes (except /api/health and /api/auth/*)
 * require either a valid Bearer token or a session cookie.
 * When API_TOKEN is not set, authentication is disabled (local dev mode).
 */

const SESSION_COOKIE_NAME = "annie_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE };

/**
 * Derive a session token from the API token using SHA-256.
 * This avoids storing the raw API_TOKEN in the cookie.
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
