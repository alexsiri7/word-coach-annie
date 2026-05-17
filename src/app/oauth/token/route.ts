import { NextRequest, NextResponse } from "next/server";
import { consumeAuthCode, getClient } from "@/lib/oauth-store";
import {
  createMcpToken,
  verifyMcpToken,
  verifyPkce,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
} from "@/lib/oauth-tokens";

/**
 * Parse the request body. Supports both application/x-www-form-urlencoded
 * and application/json, as required by OAuth 2.0.
 */
async function parseBody(
  request: NextRequest
): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await request.json();
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(json)) {
      if (typeof v === "string") result[k] = v;
    }
    return result;
  }
  // Default: form-urlencoded
  const text = await request.text();
  const params = new URLSearchParams(text);
  const result: Record<string, string> = {};
  for (const [k, v] of params) result[k] = v;
  return result;
}

function errorResponse(
  error: string,
  description: string,
  status: number = 400
) {
  return NextResponse.json(
    { error, error_description: description },
    { status }
  );
}

/**
 * POST /oauth/token
 *
 * OAuth 2.0 Token Endpoint (RFC 6749 Section 3.2).
 * Supports authorization_code and refresh_token grant types.
 */
export async function POST(request: NextRequest) {
  const body = await parseBody(request);
  const grantType = body.grant_type;

  if (grantType === "authorization_code") {
    return handleAuthorizationCode(body);
  } else if (grantType === "refresh_token") {
    return handleRefreshToken(body);
  } else {
    return errorResponse(
      "unsupported_grant_type",
      "Supported grant types: authorization_code, refresh_token"
    );
  }
}

async function handleAuthorizationCode(body: Record<string, string>) {
  const { code, redirect_uri, client_id, code_verifier } = body;

  if (!code || !redirect_uri || !client_id || !code_verifier) {
    return errorResponse(
      "invalid_request",
      "code, redirect_uri, client_id, and code_verifier are required"
    );
  }

  // Validate client exists
  const client = await getClient(client_id);
  if (!client) {
    return errorResponse("invalid_client", "Unknown client_id");
  }

  // Consume the authorization code (single use)
  const authCode = consumeAuthCode(code);
  if (!authCode) {
    return errorResponse(
      "invalid_grant",
      "Invalid or expired authorization code"
    );
  }

  // Validate redirect_uri matches
  if (authCode.redirectUri !== redirect_uri) {
    return errorResponse("invalid_grant", "redirect_uri mismatch");
  }

  // Validate client_id matches
  if (authCode.clientId !== client_id) {
    return errorResponse("invalid_grant", "client_id mismatch");
  }

  // Verify PKCE
  const pkceValid = await verifyPkce(code_verifier, authCode.codeChallenge);
  if (!pkceValid) {
    return errorResponse("invalid_grant", "PKCE verification failed");
  }

  // Issue tokens
  const accessToken = await createMcpToken(
    { userId: authCode.userId, email: authCode.email, type: "mcp_access", clientId: client_id },
    ACCESS_TOKEN_TTL
  );
  const refreshToken = await createMcpToken(
    { userId: authCode.userId, email: authCode.email, type: "mcp_refresh", clientId: client_id },
    REFRESH_TOKEN_TTL
  );

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: refreshToken,
  });
}

async function handleRefreshToken(body: Record<string, string>) {
  const { refresh_token, client_id } = body;

  if (!refresh_token || !client_id) {
    return errorResponse(
      "invalid_request",
      "refresh_token and client_id are required"
    );
  }

  // Validate client exists
  const client = await getClient(client_id);
  if (!client) {
    return errorResponse("invalid_client", "Unknown client_id");
  }

  // Verify the refresh token
  const tokenData = await verifyMcpToken(refresh_token, "mcp_refresh");
  if (!tokenData) {
    return errorResponse("invalid_grant", "Invalid or expired refresh token");
  }

  // Validate client_id matches the token's bound client
  if (tokenData.clientId !== client_id) {
    return errorResponse("invalid_grant", "client_id mismatch");
  }

  // Issue new tokens
  const accessToken = await createMcpToken(
    { userId: tokenData.userId, email: tokenData.email, type: "mcp_access", clientId: tokenData.clientId },
    ACCESS_TOKEN_TTL
  );
  const newRefreshToken = await createMcpToken(
    { userId: tokenData.userId, email: tokenData.email, type: "mcp_refresh", clientId: tokenData.clientId },
    REFRESH_TOKEN_TTL
  );

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: newRefreshToken,
  });
}
