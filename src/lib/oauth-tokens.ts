/**
 * MCP OAuth token creation and verification.
 *
 * Shared between the /oauth/token endpoint and middleware.
 * Uses the same JWT signing key as session tokens (src/lib/auth.ts).
 */
import { SignJWT, jwtVerify } from "jose";
import { resolveJwtSecret } from "@/lib/auth";

// Access token: 1 hour
export const ACCESS_TOKEN_TTL = 60 * 60;
// Refresh token: 30 days
export const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30;

/**
 * Get the JWT signing key for MCP OAuth tokens.
 * Same derivation as src/lib/auth.ts getJwtKey().
 */
async function getMcpJwtKey(): Promise<CryptoKey> {
  const secret = resolveJwtSecret();
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export interface McpTokenPayload {
  userId: string;
  email: string;
  type: "mcp_access" | "mcp_refresh";
}

/** Create a signed MCP access or refresh token. */
export async function createMcpToken(
  payload: McpTokenPayload,
  ttlSeconds: number
): Promise<string> {
  const key = await getMcpJwtKey();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key);
}

/** Verify an MCP token and return its payload, or null if invalid. */
export async function verifyMcpToken(
  token: string,
  expectedType: "mcp_access" | "mcp_refresh"
): Promise<{ userId: string; email: string } | null> {
  try {
    const key = await getMcpJwtKey();
    const { payload } = await jwtVerify(token, key);
    if (payload.type !== expectedType || !payload.userId || !payload.email) {
      return null;
    }
    return { userId: payload.userId as string, email: payload.email as string };
  } catch {
    return null;
  }
}

/** Base64url-encode a buffer. */
export function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Verify PKCE: SHA256(code_verifier) must match code_challenge. */
export async function verifyPkce(
  codeVerifier: string,
  codeChallenge: string
): Promise<boolean> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier)
  );
  const computed = base64urlEncode(digest);
  if (computed.length !== codeChallenge.length) return false;
  // Constant-time comparison using XOR to prevent timing attacks
  const a = new TextEncoder().encode(computed);
  const b = new TextEncoder().encode(codeChallenge);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
