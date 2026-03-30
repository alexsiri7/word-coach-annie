import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { getClient, createAuthCode } from "@/lib/oauth-store";

/**
 * GET /oauth/authorize
 *
 * OAuth 2.0 Authorization Endpoint (RFC 6749 Section 3.1).
 * Validates params, checks user session, and shows a consent screen.
 *
 * If the user is not logged in, redirects to /login with a return URL.
 * If logged in, renders an HTML consent page with Approve / Deny buttons.
 */
export async function GET(request: NextRequest) {
  const { error, clientName, params } = await validateRequest(request);
  if (error) return error;

  const { redirectUri, state } = params!;

  return renderConsentPage(clientName!, {
    response_type: params!.responseType,
    client_id: params!.clientId,
    redirect_uri: redirectUri,
    state: state ?? "",
    code_challenge: params!.codeChallenge,
    code_challenge_method: params!.codeChallengeMethod,
  });
}

/**
 * POST /oauth/authorize
 *
 * Handles the consent form submission. On approval, generates an
 * authorization code and redirects to the client. On denial, redirects
 * with error=access_denied.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = formData.get("action") as string | null;

  const redirectUri = formData.get("redirect_uri") as string;
  const state = formData.get("state") as string;

  // Deny => redirect with error
  if (action === "deny") {
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set("error", "access_denied");
    if (state) {
      redirectUrl.searchParams.set("state", state);
    }
    return NextResponse.redirect(redirectUrl.toString(), 303);
  }

  // Re-validate everything on the POST (params come from hidden fields)
  const responseType = formData.get("response_type") as string | null;
  const clientId = formData.get("client_id") as string | null;
  const codeChallenge = formData.get("code_challenge") as string | null;
  const codeChallengeMethod = formData.get("code_challenge_method") as string | null;

  if (responseType !== "code" || !clientId || !redirectUri || !codeChallenge || codeChallengeMethod !== "S256") {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing or invalid OAuth parameters" },
      { status: 400 },
    );
  }

  // Validate client_id
  const client = await getClient(clientId);
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Unknown client or mismatched redirect_uri" },
      { status: 400 },
    );
  }

  // Verify session again
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    return redirectToLogin(request);
  }
  const session = await verifySessionToken(sessionCookie);
  if (!session) {
    return redirectToLogin(request);
  }

  // Issue authorization code
  const authCode = createAuthCode({
    userId: session.userId,
    email: session.email,
    codeChallenge,
    codeChallengeMethod,
    redirectUri,
    clientId,
  });

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", authCode.code);
  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  return NextResponse.redirect(redirectUrl.toString(), 303);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ValidatedParams {
  responseType: string;
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
}

async function validateRequest(request: NextRequest): Promise<{
  error?: NextResponse;
  clientName?: string;
  params?: ValidatedParams;
}> {
  const sp = request.nextUrl.searchParams;

  const responseType = sp.get("response_type");
  const clientId = sp.get("client_id");
  const redirectUri = sp.get("redirect_uri");
  const state = sp.get("state");
  const codeChallenge = sp.get("code_challenge");
  const codeChallengeMethod = sp.get("code_challenge_method");

  if (responseType !== "code") {
    return {
      error: NextResponse.json(
        { error: "unsupported_response_type", error_description: "Only response_type=code is supported" },
        { status: 400 },
      ),
    };
  }

  if (!clientId) {
    return {
      error: NextResponse.json(
        { error: "invalid_request", error_description: "client_id is required" },
        { status: 400 },
      ),
    };
  }

  if (!redirectUri) {
    return {
      error: NextResponse.json(
        { error: "invalid_request", error_description: "redirect_uri is required" },
        { status: 400 },
      ),
    };
  }

  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return {
      error: NextResponse.json(
        { error: "invalid_request", error_description: "PKCE with S256 code_challenge is required" },
        { status: 400 },
      ),
    };
  }

  const client = clients.get(clientId);
  if (!client) {
    return {
      error: NextResponse.json(
        { error: "invalid_client", error_description: "Unknown client_id" },
        { status: 400 },
      ),
    };
  }

  if (!client.redirect_uris.includes(redirectUri)) {
    return {
      error: NextResponse.json(
        { error: "invalid_request", error_description: "redirect_uri does not match registered URIs" },
        { status: 400 },
      ),
    };
  }

  // Check user session
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    return { error: redirectToLogin(request) };
  }

  const session = await verifySessionToken(sessionCookie);
  if (!session) {
    return { error: redirectToLogin(request) };
  }

  return {
    clientName: client.client_name,
    params: { responseType, clientId, redirectUri, state, codeChallenge, codeChallengeMethod },
  };
}

/** Redirect to login page, preserving the full authorize URL as return path. */
function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  const fullPath = request.nextUrl.pathname + request.nextUrl.search;
  loginUrl.searchParams.set("from", fullPath);
  return NextResponse.redirect(loginUrl.toString());
}

/** Render an inline HTML consent page. */
function renderConsentPage(
  clientName: string,
  hiddenFields: Record<string, string>,
): NextResponse {
  const escapedName = escapeHtml(clientName);

  const hiddenInputs = Object.entries(hiddenFields)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`)
    .join("\n        ");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize - Annie</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8f9fa;
      color: #1a1a2e;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      max-width: 420px;
      width: 100%;
      padding: 2rem;
      text-align: center;
    }
    .logo {
      font-size: 1.75rem;
      font-weight: 700;
      color: #6366f1;
      margin-bottom: 1.5rem;
    }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.75rem; }
    .client-name {
      display: inline-block;
      background: #eef2ff;
      color: #4338ca;
      padding: 0.2rem 0.6rem;
      border-radius: 6px;
      font-weight: 600;
    }
    .description {
      color: #64748b;
      font-size: 0.95rem;
      margin: 1rem 0 1.5rem;
      line-height: 1.5;
    }
    .actions { display: flex; gap: 0.75rem; }
    button {
      flex: 1;
      padding: 0.7rem 1rem;
      border: none;
      border-radius: 8px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    button:hover { opacity: 0.85; }
    .btn-approve { background: #6366f1; color: #fff; }
    .btn-deny { background: #e2e8f0; color: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Annie</div>
    <h1>Authorize Application</h1>
    <p class="description">
      <span class="client-name">${escapedName}</span>
      wants to access your Annie writing projects.
    </p>
    <form method="post" action="/oauth/authorize">
      ${hiddenInputs}
      <div class="actions">
        <button type="submit" name="action" value="deny" class="btn-deny">Deny</button>
        <button type="submit" name="action" value="approve" class="btn-approve">Approve</button>
      </div>
    </form>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** Basic HTML entity escaping. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
