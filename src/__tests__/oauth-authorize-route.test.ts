import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE_NAME: "session",
  verifySessionToken: vi.fn(async () => ({ userId: "u1", email: "u@test.com" })),
}));

vi.mock("@/lib/oauth-store", () => ({
  getClient: vi.fn(async () => ({
    client_name: "TestApp",
    redirect_uris: ["http://localhost/callback"],
  })),
  createAuthCode: vi.fn(() => ({ code: "code-123" })),
}));

import { GET, POST } from "@/app/oauth/authorize/route";

function makeGetRequest(): NextRequest {
  return new NextRequest(
    "http://localhost/oauth/authorize?response_type=code&client_id=c1&redirect_uri=http%3A%2F%2Flocalhost%2Fcallback&code_challenge=abc&code_challenge_method=S256",
    { headers: { cookie: "session=valid-session" } },
  );
}

function makePostRequest(fields: Record<string, string>, cookieHeader = ""): NextRequest {
  const body = new URLSearchParams(fields).toString();
  return new NextRequest("http://localhost/oauth/authorize", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader,
    },
    body,
  });
}

describe("POST /oauth/authorize CSRF protection", () => {
  it("returns 403 when csrf_token is missing from form", async () => {
    const req = makePostRequest(
      {
        action: "approve",
        response_type: "code",
        client_id: "c1",
        redirect_uri: "http://localhost/callback",
        code_challenge: "abc",
        code_challenge_method: "S256",
      },
      "session=valid-session; csrf_oauth=token-abc",
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("returns 403 when csrf_token mismatches csrf_oauth cookie", async () => {
    const req = makePostRequest(
      {
        action: "approve",
        csrf_token: "wrong-token",
        response_type: "code",
        client_id: "c1",
        redirect_uri: "http://localhost/callback",
        code_challenge: "abc",
        code_challenge_method: "S256",
      },
      "session=valid-session; csrf_oauth=token-abc",
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 when csrf_oauth cookie is absent", async () => {
    const req = makePostRequest(
      {
        action: "approve",
        csrf_token: "token-abc",
        response_type: "code",
        client_id: "c1",
        redirect_uri: "http://localhost/callback",
        code_challenge: "abc",
        code_challenge_method: "S256",
      },
      "session=valid-session",
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("proceeds past CSRF check on deny when token matches cookie", async () => {
    const req = makePostRequest(
      {
        action: "deny",
        csrf_token: "token-abc",
        redirect_uri: "http://localhost/callback",
        state: "",
      },
      "session=valid-session; csrf_oauth=token-abc",
    );
    const res = await POST(req);
    // deny redirects with access_denied — not 403
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("access_denied");
  });
});

describe("GET /oauth/authorize CSRF token generation", () => {
  it("sets csrf_oauth cookie in response", async () => {
    const req = makeGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("csrf_oauth=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie.toLowerCase()).toContain("samesite=strict");
    expect(setCookie.toLowerCase()).toContain("path=/oauth/authorize");
    expect(setCookie.toLowerCase()).toContain("max-age=600");
  });

  it("embeds csrf_token as hidden input in HTML", async () => {
    const req = makeGetRequest();
    const res = await GET(req);
    const html = await res.text();
    expect(html).toMatch(
      /name="csrf_token" value="[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"/,
    );
  });

  it("csrf_oauth cookie value matches csrf_token hidden field value", async () => {
    const req = makeGetRequest();
    const res = await GET(req);
    const setCookie = res.headers.get("set-cookie") ?? "";
    const cookieMatch = setCookie.match(/csrf_oauth=([^;]+)/);
    expect(cookieMatch).not.toBeNull();
    const cookieValue = cookieMatch![1];
    const html = await res.text();
    const hiddenMatch = html.match(/name="csrf_token" value="([^"]+)"/);
    expect(hiddenMatch).not.toBeNull();
    const hiddenValue = hiddenMatch![1];
    expect(cookieValue).toBe(hiddenValue);
  });
});

describe("POST /oauth/authorize approve happy-path", () => {
  it("renders code page on approve when CSRF and session are valid (localhost redirect)", async () => {
    const req = makePostRequest(
      {
        action: "approve",
        csrf_token: "token-abc",
        response_type: "code",
        client_id: "c1",
        redirect_uri: "http://localhost/callback",
        code_challenge: "abc",
        code_challenge_method: "S256",
        state: "xyz",
      },
      "session=valid-session; csrf_oauth=token-abc",
    );
    const res = await POST(req);
    // localhost redirects render the code page (200 HTML), not a 303
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("code-123"); // from mocked createAuthCode
  });
});
