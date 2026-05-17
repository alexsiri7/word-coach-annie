/**
 * MCP OAuth token creation and verification.
 *
 * Shared between the /oauth/token endpoint and middleware.
 * Uses the same JWT signing key as session tokens (src/lib/auth.ts).
 */
import { SignJWT, jwtVerify, errors as JoseErrors } from "jose";
import { getJwtKey, safeEqual, JWT_ISSUER } from "@/lib/auth";

const JWT_AUDIENCE_MCP_ACCESS = "word-coach-annie:mcp_access";
const JWT_AUDIENCE_MCP_REFRESH = "word-coach-annie:mcp_refresh";
import { logger } from "@/lib/logger";

// Access token: 1 hour
export const ACCESS_TOKEN_TTL = 60 * 60;
// Refresh token: 30 days
export const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30;

export interface McpTokenPayload {
  userId: string;
  email: string;
  type: "mcp_access" | "mcp_refresh";
  clientId: string;
}

/** Create a signed MCP access or refresh token. */
export async function createMcpToken(
  payload: McpTokenPayload,
  ttlSeconds: number
): Promise<string> {
  const key = await getJwtKey();
  const audience = payload.type === "mcp_access"
    ? JWT_AUDIENCE_MCP_ACCESS
    : JWT_AUDIENCE_MCP_REFRESH;
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key);
}

/** Verify an MCP token and return its payload, or null if invalid. */
export async function verifyMcpToken(
  token: string,
  expectedType: "mcp_access" | "mcp_refresh"
): Promise<{ userId: string; email: string; clientId: string } | null> {
  try {
    const key = await getJwtKey();
    const audience = expectedType === "mcp_access"
      ? JWT_AUDIENCE_MCP_ACCESS
      : JWT_AUDIENCE_MCP_REFRESH;
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience,
    });
    if (
      payload.type !== expectedType ||
      !payload.userId ||
      !payload.email ||
      !payload.clientId
    ) {
      return null;
    }
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      clientId: payload.clientId as string,
    };
  } catch (err) {
    // Expected: token is expired, tampered, or has wrong type — treat as invalid.
    if (
      err instanceof JoseErrors.JWTExpired ||
      err instanceof JoseErrors.JWTInvalid ||
      err instanceof JoseErrors.JWSSignatureVerificationFailed ||
      err instanceof JoseErrors.JOSEError
    ) {
      return null;
    }
    // Unexpected: infrastructure failure (missing key, crypto error).
    // Log with full context so Sentry captures it, then return null so
    // callers still return 400 rather than an unhandled 500.
    logger.error("verifyMcpToken: unexpected error during JWT verification", err);
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

/**
 * Verify PKCE: SHA256(code_verifier) must match code_challenge.
 * Uses timing-resistant comparison to prevent timing oracle attacks.
 */
export async function verifyPkce(
  codeVerifier: string,
  codeChallenge: string
): Promise<boolean> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier)
  );
  const computed = base64urlEncode(digest);
  return safeEqual(computed, codeChallenge);
}
