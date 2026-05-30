import { NextResponse } from "next/server";

/**
 * GET /.well-known/oauth-authorization-server
 *
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 * Used by MCP clients (e.g. Claude Code) to discover endpoints.
 */
export function GET() {
  const origin = process.env.APP_URL || process.env.NEXTAUTH_URL;
  if (!origin) {
    return NextResponse.json(
      { error: "Server misconfigured: APP_URL not set" },
      { status: 500 }
    );
  }

  // Strip trailing slash if present
  const base = origin.replace(/\/$/, "");

  return NextResponse.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}
