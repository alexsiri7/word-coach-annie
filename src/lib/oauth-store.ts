/**
 * OAuth 2.0 storage for MCP remote access.
 *
 * Client registrations and auth codes are persisted to the database so they
 * survive Railway deploys and work across multiple replicas.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const IP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
export const IP_REGISTRATION_LIMIT = 25;
export const GLOBAL_CLIENT_LIMIT = parseInt(
  process.env.OAUTH_GLOBAL_CLIENT_LIMIT ?? "10000",
  10
);

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
  registration: ClientRegistration,
  options?: { ip?: string; userId?: string }
): Promise<void> {
  await prisma.oAuthClient.create({
    data: {
      id: registration.client_id,
      clientName: registration.client_name,
      redirectUris: JSON.stringify(registration.redirect_uris),
      grantTypes: JSON.stringify(registration.grant_types),
      registrationIp: options?.ip ?? null,
      registrationUserId: options?.userId ?? null,
    },
  });
}

/** Count clients registered from this IP within the rolling 24h window. */
export async function countClientsByIpInWindow(ip: string): Promise<number> {
  return prisma.oAuthClient.count({
    where: {
      registrationIp: ip,
      createdAt: { gte: new Date(Date.now() - IP_WINDOW_MS) },
    },
  });
}

/** Count total OAuth clients (for global capacity cap). */
export async function countTotalClients(): Promise<number> {
  return prisma.oAuthClient.count();
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

const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Create an auth code entry persisted to the database, expires in 5 minutes. */
export async function createAuthCode(
  params: Omit<AuthCode, "code" | "expiresAt">
): Promise<AuthCode> {
  const code = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS);
  try {
    await prisma.oAuthAuthCode.create({
      data: {
        code,
        userId: params.userId,
        email: params.email,
        codeChallenge: params.codeChallenge,
        codeChallengeMethod: params.codeChallengeMethod,
        redirectUri: params.redirectUri,
        clientId: params.clientId,
        expiresAt,
      },
    });
  } catch (err) {
    logger.error("createAuthCode: failed to persist auth code", {
      userId: params.userId,
      clientId: params.clientId,
      err,
    });
    throw err;
  }
  return { ...params, code, expiresAt: expiresAt.getTime() };
}

/**
 * Consume an auth code (single use). Returns null if not found or expired.
 *
 * Note: `findUnique` + `delete` are two separate DB calls. In practice this
 * is safe for low-concurrency OAuth flows, but is not strictly atomic — a
 * narrow TOCTOU window exists under high concurrency. Use a `$transaction`
 * if strict exactly-once guarantees are needed.
 */
export async function consumeAuthCode(code: string): Promise<AuthCode | null> {
  const row = await prisma.oAuthAuthCode.findUnique({ where: { code } });
  if (!row) return null;
  // Delete regardless of expiry (clean up always)
  try {
    await prisma.oAuthAuthCode.delete({ where: { code } });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      // Another replica already consumed this code — treat as already used.
      return null;
    }
    logger.error("consumeAuthCode: unexpected error deleting auth code", err);
    throw err;
  }
  if (row.expiresAt < new Date()) return null;
  return {
    code: row.code,
    userId: row.userId,
    email: row.email,
    codeChallenge: row.codeChallenge,
    codeChallengeMethod: row.codeChallengeMethod,
    redirectUri: row.redirectUri,
    clientId: row.clientId,
    expiresAt: row.expiresAt.getTime(),
  };
}
