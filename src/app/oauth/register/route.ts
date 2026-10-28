import { NextRequest, NextResponse } from "next/server";
import {
  registerClient,
  countClientsByIpInWindow,
  countTotalClients,
  IP_REGISTRATION_LIMIT,
  GLOBAL_CLIENT_LIMIT,
  SUPPORTED_GRANT_TYPES,
  isLoopbackHost,
  type ClientRegistration,
} from "@/lib/oauth-store";
import { getCurrentUserId } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

const DEFAULT_ALLOWED_REDIRECT_HOSTS = "claude.ai";

/**
 * Loopback redirects (CLI tools) may use http or https; any other host must be
 * HTTPS and listed in OAUTH_ALLOWED_REDIRECT_HOSTS, so a freely registered
 * client cannot send authorization codes to an attacker-controlled site.
 */
function isAllowedRedirect(uri: URL): boolean {
  if (isLoopbackHost(uri.hostname)) {
    return uri.protocol === "http:" || uri.protocol === "https:";
  }
  const allowedHosts = (env.OAUTH_ALLOWED_REDIRECT_HOSTS?.trim() || DEFAULT_ALLOWED_REDIRECT_HOSTS)
    .split(",")
    .map((h) => h.trim().toLowerCase());
  return uri.protocol === "https:" && allowedHosts.includes(uri.hostname);
}

/**
 * POST /oauth/register
 *
 * OAuth 2.0 Dynamic Client Registration (RFC 7591).
 * MCP clients call this to register before starting the auth flow.
 */
export async function POST(request: NextRequest) {
  // Per-IP throttle to limit client registration abuse
  const ip = getClientIp(request.headers);
  if (process.env.DISABLE_RATE_LIMIT !== "true") {
    const rl = await checkRateLimit(`oauth-register:${ip}`, { limit: 5, windowMs: 3_600_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", error_description: "too many registration attempts" },
        { status: 429 }
      );
    }
  }

  // DB-persisted per-IP limit (24h rolling window, survives deploys)
  const ipCount = await countClientsByIpInWindow(ip);
  if (ipCount >= IP_REGISTRATION_LIMIT) {
    logger.warn("oauth-registration-rejected", { reason: "ip_limit", ipCount });
    return NextResponse.json(
      { error: "rate_limited", error_description: "too many registrations from this IP" },
      { status: 429 }
    );
  }

  // Global client cap
  const totalCount = await countTotalClients();
  if (totalCount >= GLOBAL_CLIENT_LIMIT) {
    logger.warn("oauth-registration-rejected", { reason: "global_limit", totalCount });
    return NextResponse.json(
      { error: "server_error", error_description: "registration capacity reached" },
      { status: 503 }
    );
  }

  const userId = getCurrentUserId(request);  // null when not logged in — tracked for audit only

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return NextResponse.json(
      {
        error: "invalid_client_metadata",
        error_description: "redirect_uris is required and must be a non-empty array",
      },
      { status: 400 }
    );
  }

  if (redirectUris.length > 5) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "too many redirect_uris (max 5)" },
      { status: 400 }
    );
  }

  // Validate each redirect URI is a valid URL
  for (const uri of redirectUris) {
    if (typeof uri !== "string") {
      return NextResponse.json(
        {
          error: "invalid_client_metadata",
          error_description: "Each redirect_uri must be a string",
        },
        { status: 400 }
      );
    }
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      return NextResponse.json(
        {
          error: "invalid_client_metadata",
          error_description: `Invalid redirect_uri: ${uri}`,
        },
        { status: 400 }
      );
    }

    if (!isAllowedRedirect(parsed)) {
      return NextResponse.json(
        {
          error: "invalid_client_metadata",
          error_description:
            "redirect_uris must be http(s) loopback or HTTPS on an allowed host",
        },
        { status: 400 }
      );
    }
  }

  const requestedGrantTypes = body.grant_types;
  const grantTypes = Array.isArray(requestedGrantTypes)
    ? SUPPORTED_GRANT_TYPES.filter((g) => requestedGrantTypes.includes(g))
    : [...SUPPORTED_GRANT_TYPES];
  if (grantTypes.length === 0) {
    return NextResponse.json(
      {
        error: "invalid_client_metadata",
        error_description: `grant_types must include one of: ${SUPPORTED_GRANT_TYPES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const clientId = crypto.randomUUID();
  const rawClientName = typeof body.client_name === "string" ? body.client_name : "Unknown Client";
  const clientName = rawClientName.slice(0, 80);

  const registration: ClientRegistration = {
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris as string[],
    grant_types: grantTypes,
    registered_at: Date.now(),
  };

  await registerClient(registration, { ip, userId: userId ?? undefined });
  logger.info("oauth-client-registered", { clientId, userId });

  const { client_id, client_name, redirect_uris, grant_types } = registration;
  return NextResponse.json({ client_id, client_name, redirect_uris, grant_types }, { status: 201 });
}
