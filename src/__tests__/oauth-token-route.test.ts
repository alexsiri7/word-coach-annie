import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/oauth-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/oauth-store")>()),
  consumeAuthCode: vi.fn(),
  findAuthCode: vi.fn(),
  getClient: vi.fn(),
}));

vi.mock("@/lib/oauth-tokens", () => ({
  createMcpToken: vi.fn(async () => "mock-token"),
  verifyMcpToken: vi.fn(),
  verifyPkce: vi.fn(),
  ACCESS_TOKEN_TTL: 3600,
  REFRESH_TOKEN_TTL: 2592000,
}));

vi.mock("@/lib/token-blocklist", () => ({
  claimToken: vi.fn(async () => true),
}));

vi.mock("@/lib/auth-server", () => ({
  getActiveUser: vi.fn(),
}));

import { consumeAuthCode, findAuthCode, getClient } from "@/lib/oauth-store";
import { createMcpToken, verifyMcpToken, verifyPkce } from "@/lib/oauth-tokens";
import { claimToken } from "@/lib/token-blocklist";
import { getActiveUser } from "@/lib/auth-server";
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
    vi.mocked(getActiveUser).mockResolvedValue({ userId: "user-1", email: "user@test.com", name: "", picture: undefined });
    vi.mocked(claimToken).mockResolvedValue(true);
    vi.mocked(consumeAuthCode).mockResolvedValue(true);
  });

  it("authorization_code grant with valid params returns tokens", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(findAuthCode).mockResolvedValue(mockAuthCode);
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
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(findAuthCode).mockResolvedValue(mockAuthCode);
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
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(findAuthCode).mockResolvedValue(null);

    const res = await POST(makeTokenRequest(validAuthCodeBody));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_grant");
  });

  it("PKCE mismatch returns 400 invalid_grant", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(findAuthCode).mockResolvedValue(mockAuthCode);
    vi.mocked(verifyPkce).mockResolvedValue(false);

    const res = await POST(makeTokenRequest(validAuthCodeBody));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_grant");
  });

  it.each([
    ["client_id", { client_id: "client-2" }],
    ["redirect_uri", { redirect_uri: "http://localhost/other" }],
  ])("authorization_code grant with a wrong %s does not consume the code", async (_, bad) => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-2", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(findAuthCode).mockResolvedValue(mockAuthCode);
    vi.mocked(verifyPkce).mockResolvedValue(true);

    const res = await POST(makeTokenRequest({ ...validAuthCodeBody, ...bad }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_grant");
    expect(vi.mocked(consumeAuthCode)).not.toHaveBeenCalled();
  });

  it("PKCE mismatch does not consume the code", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(findAuthCode).mockResolvedValue(mockAuthCode);
    vi.mocked(verifyPkce).mockResolvedValue(false);

    await POST(makeTokenRequest(validAuthCodeBody));
    expect(vi.mocked(consumeAuthCode)).not.toHaveBeenCalled();
  });

  it("authorization_code grant consumes the code only after validation passes", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(findAuthCode).mockResolvedValue(mockAuthCode);
    vi.mocked(verifyPkce).mockResolvedValue(true);

    await POST(makeTokenRequest(validAuthCodeBody));
    expect(vi.mocked(consumeAuthCode)).toHaveBeenCalledWith("auth-code-123");
  });

  it("authorization_code grant losing the consume race returns invalid_grant without tokens", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(findAuthCode).mockResolvedValue(mockAuthCode);
    vi.mocked(verifyPkce).mockResolvedValue(true);
    vi.mocked(consumeAuthCode).mockResolvedValue(false);

    const res = await POST(makeTokenRequest(validAuthCodeBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_grant");
    expect(vi.mocked(createMcpToken)).not.toHaveBeenCalled();
  });

  it("authorization_code grant returns 500 server_error when consuming the code throws", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(findAuthCode).mockResolvedValue(mockAuthCode);
    vi.mocked(verifyPkce).mockResolvedValue(true);
    vi.mocked(consumeAuthCode).mockRejectedValue(new Error("Connection refused"));

    const res = await POST(makeTokenRequest(validAuthCodeBody));
    expect(res.status).toBe(500);
    expect(vi.mocked(createMcpToken)).not.toHaveBeenCalled();
  });

  it("authorization_code grant is refused for a client not registered for it", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["refresh_token"], registered_at: 0 });

    const res = await POST(makeTokenRequest(validAuthCodeBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unauthorized_client");
    expect(vi.mocked(findAuthCode)).not.toHaveBeenCalled();
  });

  it("refresh_token grant is refused for a client not registered for it", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code"], registered_at: 0 });

    const res = await POST(makeTokenRequest({
      grant_type: "refresh_token",
      refresh_token: "valid-refresh",
      client_id: "client-1",
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unauthorized_client");
    expect(vi.mocked(verifyMcpToken)).not.toHaveBeenCalled();
    expect(vi.mocked(createMcpToken)).not.toHaveBeenCalled();
  });

  it("refresh_token grant with valid token returns new tokens", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(verifyMcpToken).mockResolvedValue({ userId: "user-1", email: "user@test.com", clientId: "client-1", jti: "token-jti-123", exp: Math.floor(Date.now() / 1000) + 2592000 });

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

  it("refresh_token grant claims (revokes) old token before issuing new ones", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(verifyMcpToken).mockResolvedValue({ userId: "user-1", email: "user@test.com", clientId: "client-1", jti: "old-jti", exp: Math.floor(Date.now() / 1000) + 2592000 });
    vi.mocked(claimToken).mockResolvedValue(true);

    const res = await POST(makeTokenRequest({
      grant_type: "refresh_token",
      refresh_token: "valid-refresh",
      client_id: "client-1",
    }));
    expect(res.status).toBe(200);
    expect(vi.mocked(claimToken)).toHaveBeenCalledWith("old-jti", "user-1", expect.any(Date));
  });

  it("refresh_token grant with already-used token returns 400 invalid_grant", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(verifyMcpToken).mockResolvedValue({ userId: "user-1", email: "user@test.com", clientId: "client-1", jti: "used-jti", exp: Math.floor(Date.now() / 1000) + 2592000 });
    vi.mocked(claimToken).mockResolvedValue(false); // jti already claimed = token reused

    const res = await POST(makeTokenRequest({
      grant_type: "refresh_token",
      refresh_token: "already-used-refresh",
      client_id: "client-1",
    }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_grant");
    expect(vi.mocked(createMcpToken)).not.toHaveBeenCalled();
  });

  it("refresh_token grant with mismatched client_id returns 400 invalid_grant", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-2", client_name: "Other App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(verifyMcpToken).mockResolvedValue({ userId: "user-1", email: "user@test.com", clientId: "client-1", jti: "jti-1", exp: Math.floor(Date.now() / 1000) + 2592000 });

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
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
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

  it("refresh_token grant with jti-less legacy token still rotates successfully", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    // Legacy token: no jti, no exp — issued before this fix was deployed
    vi.mocked(verifyMcpToken).mockResolvedValue({
      userId: "user-1", email: "user@test.com", clientId: "client-1",
      jti: undefined, exp: undefined,
    });

    const res = await POST(makeTokenRequest({
      grant_type: "refresh_token",
      refresh_token: "legacy-refresh-no-jti",
      client_id: "client-1",
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.access_token).toBe("mock-token");
    expect(body.refresh_token).toBe("mock-token");
    // Blocklist is not consulted for tokens without jti
    expect(vi.mocked(claimToken)).not.toHaveBeenCalled();
  });

  it("refresh_token grant with jti but no exp uses fallback expiresAt for claim", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(verifyMcpToken).mockResolvedValue({
      userId: "user-1", email: "user@test.com", clientId: "client-1",
      jti: "jti-no-exp", exp: undefined,
    });
    vi.mocked(claimToken).mockResolvedValue(true);

    const res = await POST(makeTokenRequest({
      grant_type: "refresh_token",
      refresh_token: "refresh-no-exp",
      client_id: "client-1",
    }));
    expect(res.status).toBe(200);
    expect(vi.mocked(claimToken)).toHaveBeenCalledWith("jti-no-exp", "user-1", expect.any(Date));
  });

  it("refresh_token grant returns 500 server_error when claimToken throws", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(verifyMcpToken).mockResolvedValue({
      userId: "user-1", email: "user@test.com", clientId: "client-1",
      jti: "jti-db-fail", exp: Math.floor(Date.now() / 1000) + 2592000,
    });
    vi.mocked(claimToken).mockRejectedValue(new Error("Connection refused"));

    const res = await POST(makeTokenRequest({
      grant_type: "refresh_token",
      refresh_token: "refresh-db-fail",
      client_id: "client-1",
    }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("server_error");
    expect(vi.mocked(createMcpToken)).not.toHaveBeenCalled();
  });

  it("refresh_token grant rejects with invalid_grant when the user is deleted or no longer allowed", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(verifyMcpToken).mockResolvedValue({
      userId: "user-1", email: "user@test.com", clientId: "client-1",
      jti: "jti-gone", exp: Math.floor(Date.now() / 1000) + 2592000,
    });
    vi.mocked(getActiveUser).mockResolvedValue(null);

    const res = await POST(makeTokenRequest({
      grant_type: "refresh_token",
      refresh_token: "refresh-gone",
      client_id: "client-1",
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_grant");
    expect(vi.mocked(claimToken)).not.toHaveBeenCalled();
    expect(vi.mocked(createMcpToken)).not.toHaveBeenCalled();
  });

  it("refresh_token grant returns 500 server_error when the user lookup throws", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(verifyMcpToken).mockResolvedValue({
      userId: "user-1", email: "user@test.com", clientId: "client-1",
      jti: "jti-lookup-fail", exp: Math.floor(Date.now() / 1000) + 2592000,
    });
    vi.mocked(getActiveUser).mockRejectedValue(new Error("Connection refused"));

    const res = await POST(makeTokenRequest({
      grant_type: "refresh_token",
      refresh_token: "refresh-lookup-fail",
      client_id: "client-1",
    }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("server_error");
    expect(vi.mocked(claimToken)).not.toHaveBeenCalled();
  });

  it("refresh_token grant issues tokens with the current email from the user row", async () => {
    vi.mocked(getClient).mockResolvedValue({ client_id: "client-1", client_name: "App", redirect_uris: [], grant_types: ["authorization_code", "refresh_token"], registered_at: 0 });
    vi.mocked(verifyMcpToken).mockResolvedValue({
      userId: "user-1", email: "old@test.com", clientId: "client-1",
      jti: "jti-new-email", exp: Math.floor(Date.now() / 1000) + 2592000,
    });
    vi.mocked(getActiveUser).mockResolvedValue({ userId: "user-1", email: "new@test.com", name: "", picture: undefined });

    const res = await POST(makeTokenRequest({
      grant_type: "refresh_token",
      refresh_token: "refresh-new-email",
      client_id: "client-1",
    }));
    expect(res.status).toBe(200);
    expect(vi.mocked(createMcpToken)).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new@test.com", type: "mcp_access" }), 3600
    );
    expect(vi.mocked(createMcpToken)).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new@test.com", type: "mcp_refresh" }), 2592000
    );
  });
});
