import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/oauth-store", () => ({
  consumeAuthCode: vi.fn(),
  getClient: vi.fn(),
}));

vi.mock("@/lib/oauth-tokens", () => ({
  createMcpToken: vi.fn(async () => "mock-token"),
  verifyMcpToken: vi.fn(),
  verifyPkce: vi.fn(),
  ACCESS_TOKEN_TTL: 3600,
  REFRESH_TOKEN_TTL: 2592000,
}));

import { consumeAuthCode, getClient } from "@/lib/oauth-store";
import { createMcpToken, verifyMcpToken, verifyPkce } from "@/lib/oauth-tokens";
import { POST } from "@/app/oauth/token/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTokenRequest(body: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validAuthCodeBody = {
  grant_type: "authorization_code",
  code: "auth-code-123",
  redirect_uri: "http://localhost/callback",
  client_id: "client-1",
  code_verifier: "verifier-abc",
};

const mockAuthCode = {
  code: "auth-code-123",
  userId: "user-1",
  email: "user@test.com",
  codeChallenge: "challenge",
  codeChallengeMethod: "S256",
  redirectUri: "http://localhost/callback",
  clientId: "client-1",
  expiresAt: Date.now() + 300_000,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /oauth/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authorization_code grant with valid params returns tokens", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: [], registered_at: 0 });
    vi.mocked(consumeAuthCode).mockResolvedValue(mockAuthCode);
    vi.mocked(verifyPkce).mockResolvedValue(true);

    const res = await POST(makeTokenRequest(validAuthCodeBody));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.access_token).toBe("mock-token");
    expect(body.refresh_token).toBe("mock-token");
    expect(body.expires_in).toBe(3600);
    expect(body.token_type).toBe("Bearer");
  });

  it("authorization_code grant embeds client_id in issued tokens", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: [], registered_at: 0 });
    vi.mocked(consumeAuthCode).mockResolvedValue(mockAuthCode);
    vi.mocked(verifyPkce).mockResolvedValue(true);

    await POST(makeTokenRequest(validAuthCodeBody));

    expect(vi.mocked(createMcpToken)).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "client-1", type: "mcp_access" }),
      expect.any(Number)
    );
    expect(vi.mocked(createMcpToken)).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "client-1", type: "mcp_refresh" }),
      expect.any(Number)
    );
  });

  it("missing code_verifier returns 400 invalid_request", async () => {
    const { code_verifier: _, ...noVerifier } = validAuthCodeBody;
    const res = await POST(makeTokenRequest(noVerifier));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_request");
  });

  it("unknown client_id returns 400 invalid_client", async () => {
    vi.mocked(getClient).mockResolvedValue(null);

    const res = await POST(makeTokenRequest(validAuthCodeBody));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_client");
  });

  it("invalid/expired auth code returns 400 invalid_grant", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: [], registered_at: 0 });
    vi.mocked(consumeAuthCode).mockResolvedValue(null);

    const res = await POST(makeTokenRequest(validAuthCodeBody));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_grant");
  });

  it("PKCE mismatch returns 400 invalid_grant", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: [], registered_at: 0 });
    vi.mocked(consumeAuthCode).mockResolvedValue(mockAuthCode);
    vi.mocked(verifyPkce).mockResolvedValue(false);

    const res = await POST(makeTokenRequest(validAuthCodeBody));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_grant");
  });

  it("refresh_token grant with valid token returns new tokens", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: [], registered_at: 0 });
    vi.mocked(verifyMcpToken).mockResolvedValue({ userId: "user-1", email: "user@test.com", clientId: "client-1" });

    const res = await POST(makeTokenRequest({
      grant_type: "refresh_token",
      refresh_token: "valid-refresh",
      client_id: "client-1",
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.access_token).toBe("mock-token");
    expect(body.refresh_token).toBe("mock-token");
  });

  it("refresh_token grant with mismatched client_id returns 400 invalid_grant", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-2", client_name: "Other App", redirect_uris: [], grant_types: [], registered_at: 0 });
    vi.mocked(verifyMcpToken).mockResolvedValue({ userId: "user-1", email: "user@test.com", clientId: "client-1" });

    const res = await POST(makeTokenRequest({
      grant_type: "refresh_token",
      refresh_token: "valid-refresh",
      client_id: "client-2",
    }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_grant");
  });

  it("refresh_token grant with expired token returns 400 invalid_grant", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: [], registered_at: 0 });
    vi.mocked(verifyMcpToken).mockResolvedValue(null);

    const res = await POST(makeTokenRequest({
      grant_type: "refresh_token",
      refresh_token: "expired-refresh",
      client_id: "client-1",
    }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_grant");
  });

  it("unsupported grant_type returns 400 unsupported_grant_type", async () => {
    const res = await POST(makeTokenRequest({
      grant_type: "client_credentials",
    }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("unsupported_grant_type");
  });
});
