/**
 * In-memory OAuth 2.0 storage for MCP remote access.
 *
 * Stores dynamic client registrations and pending authorization codes.
 * Suitable for a single Railway instance. Data is lost on restart,
 * which is acceptable — clients will re-register automatically.
 */

export interface ClientRegistration {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  registered_at: number;
}

export interface AuthCode {
  code: string;
  userId: string;
  email: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  clientId: string;
  expiresAt: number;
}

/** Registered OAuth clients (client_id -> registration). */
export const clients = new Map<string, ClientRegistration>();

/** Pending authorization codes (code -> auth code details). Expire after 5 min. */
export const authCodes = new Map<string, AuthCode>();

const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Periodically clean up expired authorization codes. */
function cleanupExpiredCodes() {
  const now = Date.now();
  for (const [code, data] of authCodes) {
    if (data.expiresAt < now) {
      authCodes.delete(code);
    }
  }
}

// Run cleanup every 60 seconds
setInterval(cleanupExpiredCodes, 60_000).unref();

/** Create an auth code entry that expires in 5 minutes. */
export function createAuthCode(
  params: Omit<AuthCode, "code" | "expiresAt">
): AuthCode {
  const code = crypto.randomUUID();
  const entry: AuthCode = {
    ...params,
    code,
    expiresAt: Date.now() + AUTH_CODE_TTL_MS,
  };
  authCodes.set(code, entry);
  return entry;
}

/** Consume an auth code (single use). Returns null if not found or expired. */
export function consumeAuthCode(code: string): AuthCode | null {
  const entry = authCodes.get(code);
  if (!entry) return null;
  authCodes.delete(code);
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}
