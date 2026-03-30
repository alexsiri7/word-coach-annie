/**
 * OAuth 2.0 storage for MCP remote access.
 *
 * Client registrations are persisted to the database so they survive
 * Railway deploys. Auth codes remain in-memory (short-lived, 5 min).
 */

import { prisma } from "@/lib/db";

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

/** Register an OAuth client (persisted to database). */
export async function registerClient(
  registration: ClientRegistration
): Promise<void> {
  await prisma.oAuthClient.create({
    data: {
      id: registration.client_id,
      clientName: registration.client_name,
      redirectUris: JSON.stringify(registration.redirect_uris),
      grantTypes: JSON.stringify(registration.grant_types),
    },
  });
}

/** Look up a registered OAuth client by ID. Returns null if not found. */
export async function getClient(
  clientId: string
): Promise<ClientRegistration | null> {
  const row = await prisma.oAuthClient.findUnique({
    where: { id: clientId },
  });
  if (!row) return null;
  return {
    client_id: row.id,
    client_name: row.clientName,
    redirect_uris: JSON.parse(row.redirectUris) as string[],
    grant_types: JSON.parse(row.grantTypes) as string[],
    registered_at: row.createdAt.getTime(),
  };
}

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
