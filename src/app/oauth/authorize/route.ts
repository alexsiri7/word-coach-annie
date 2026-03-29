import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { clients, createAuthCode } from "@/lib/oauth-store";

/**
 * GET /oauth/authorize
 *
 * OAuth 2.0 Authorization Endpoint (RFC 6749 Section 3.1).
 * Validates params, checks user session, and issues an authorization code.
 *
 * If the user is not logged in, redirects to /login with a return URL.
 * If logged in, auto-approves and redirects back to the client with a code.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const responseType = params.get("response_type");
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const state = params.get("state");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");

  // Validate required params
  if (responseType !== "code") {
    return NextResponse.json(
      { error: "unsupported_response_type", error_description: "Only response_type=code is supported" },
      { status: 400 }
    );
  }

  if (!clientId) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "client_id is required" },
      { status: 400 }
    );
  }

  if (!redirectUri) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "redirect_uri is required" },
      { status: 400 }
    );
  }

  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return NextResponse.json(
      { error: "invalid_request", error_description: "PKCE with S256 code_challenge is required" },
      { status: 400 }
    );
  }

  // Validate client_id
  const client = clients.get(clientId);
  if (!client) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Unknown client_id" },
      { status: 400 }
    );
  }

  // Validate redirect_uri matches registration
  if (!client.redirect_uris.includes(redirectUri)) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "redirect_uri does not match registered URIs" },
      { status: 400 }
    );
  }

  // Check user session
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    return redirectToLogin(request);
  }

  const session = await verifySessionToken(sessionCookie);
  if (!session) {
    return redirectToLogin(request);
  }

  // User is authenticated — issue authorization code
  const authCode = createAuthCode({
    userId: session.userId,
    email: session.email,
    codeChallenge,
    codeChallengeMethod,
    redirectUri,
    clientId,
  });

  // Redirect back to the client with code and state
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", authCode.code);
  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  return NextResponse.redirect(redirectUrl.toString());
}

/** Redirect to login page, preserving the full authorize URL as return path. */
function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  // Preserve the full authorize URL so the user returns here after login
  const fullPath = request.nextUrl.pathname + request.nextUrl.search;
  loginUrl.searchParams.set("from", fullPath);
  return NextResponse.redirect(loginUrl.toString());
}
