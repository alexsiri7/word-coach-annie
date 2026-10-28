import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/oauth-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/oauth-store")>()),
  registerClient: vi.fn(),
  countClientsByIpInWindow: vi.fn().mockResolvedValue(0),
  countTotalClients: vi.fn().mockResolvedValue(0),
  IP_REGISTRATION_LIMIT: 25,
  GLOBAL_CLIENT_LIMIT: 10000,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 5, resetMs: 0 }),
}));

vi.mock("@/lib/auth", () => ({ isAuthEnabled: vi.fn().mockReturnValue(false) }));
vi.mock("@/lib/api-auth", () => ({ getCurrentUserId: vi.fn().mockReturnValue(null) }));

import { countClientsByIpInWindow, countTotalClients, registerClient } from "@/lib/oauth-store";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { POST } from "@/app/oauth/register/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRegisterRequest(body: Record<string, unknown>, ip = "1.2.3.4"): NextRequest {
  return new NextRequest("http://localhost/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip },
    body: JSON.stringify(body),
  });
}

const validBody = { redirect_uris: ["http://localhost:3000/cb"] };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /oauth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 5, resetMs: 0 });
    vi.mocked(countClientsByIpInWindow).mockResolvedValue(0);
    vi.mocked(countTotalClients).mockResolvedValue(0);
  });

  it("returns 201 with client_id on valid registration", async () => {
    const res = await POST(makeRegisterRequest(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.client_id).toBeTruthy();
    expect(body.redirect_uris).toEqual(["http://localhost:3000/cb"]);
  });

  it("does not log the client IP on success or on a per-IP rejection", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    await POST(makeRegisterRequest(validBody, "203.0.113.7"));
    vi.mocked(countClientsByIpInWindow).mockResolvedValue(25);
    await POST(makeRegisterRequest(validBody, "203.0.113.7"));

    expect(info).toHaveBeenCalledWith("oauth-client-registered", expect.any(Object));
    expect(warn).toHaveBeenCalledWith("oauth-registration-rejected", expect.any(Object));
    expect(JSON.stringify([...info.mock.calls, ...warn.mock.calls])).not.toContain("203.0.113.7");
  });

  it("returns 429 when in-memory rate limit exceeded", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetMs: Date.now() + 1000,
      retryAfterMs: 1000,
    });
    const res = await POST(makeRegisterRequest(validBody));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
  });

  it("returns 429 when per-IP 24h DB limit exceeded", async () => {
    vi.mocked(countClientsByIpInWindow).mockResolvedValue(25);
    const res = await POST(makeRegisterRequest(validBody));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
  });

  it("returns 503 when global client limit reached", async () => {
    vi.mocked(countTotalClients).mockResolvedValue(10000);
    const res = await POST(makeRegisterRequest(validBody));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("server_error");
  });

  it("keys the per-IP limits on x-real-ip, not a spoofed x-forwarded-for", async () => {
    const req = new NextRequest("http://localhost/oauth/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": "9.9.9.9",
        "x-forwarded-for": "6.6.6.6",
      },
      body: JSON.stringify(validBody),
    });
    await POST(req);
    expect(checkRateLimit).toHaveBeenCalledWith("oauth-register:9.9.9.9", expect.anything());
    expect(countClientsByIpInWindow).toHaveBeenCalledWith("9.9.9.9");
  });

  it("returns 400 when redirect_uris missing", async () => {
    const res = await POST(makeRegisterRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when redirect_uri uses plain HTTP (non-localhost)", async () => {
    const res = await POST(makeRegisterRequest({ redirect_uris: ["http://evil.com/cb"] }));
    expect(res.status).toBe(400);
  });

  describe("redirect host allow-list", () => {
    afterEach(() => {
      delete process.env.OAUTH_ALLOWED_REDIRECT_HOSTS;
    });

    it.each([
      "http://localhost:3000/cb",
      "https://127.0.0.1/cb",
      "http://[::1]:8080/cb",
      "https://claude.ai/api/mcp/auth_callback",
    ])("accepts %s by default", async (uri) => {
      const res = await POST(makeRegisterRequest({ redirect_uris: [uri] }));
      expect(res.status).toBe(201);
    });

    it.each([
      "https://evil.example/cb",
      "https://claude.ai.evil.example/cb",
      "http://claude.ai/cb",
      "ftp://localhost/cb",
      "myapp://localhost/cb",
    ])("rejects %s by default", async (uri) => {
      const res = await POST(makeRegisterRequest({ redirect_uris: [uri] }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_client_metadata");
      expect(registerClient).not.toHaveBeenCalled();
    });

    it("rejects the whole registration when any one redirect_uri is not allowed", async () => {
      const res = await POST(makeRegisterRequest({
        redirect_uris: ["https://claude.ai/cb", "https://evil.example/cb"],
      }));
      expect(res.status).toBe(400);
    });

    it("uses OAUTH_ALLOWED_REDIRECT_HOSTS instead of the default when set", async () => {
      process.env.OAUTH_ALLOWED_REDIRECT_HOSTS = " Connector.Example , other.example";
      expect((await POST(makeRegisterRequest({ redirect_uris: ["https://connector.example/cb"] }))).status).toBe(201);
      expect((await POST(makeRegisterRequest({ redirect_uris: ["https://claude.ai/cb"] }))).status).toBe(400);
      expect((await POST(makeRegisterRequest({ redirect_uris: ["http://localhost:3000/cb"] }))).status).toBe(201);
    });
  });

  describe("grant_types", () => {
    it("defaults to authorization_code and refresh_token", async () => {
      const res = await POST(makeRegisterRequest(validBody));
      expect((await res.json()).grant_types).toEqual(["authorization_code", "refresh_token"]);
    });

    it("stores only the supported subset of requested grant types", async () => {
      const res = await POST(makeRegisterRequest({
        ...validBody,
        grant_types: ["authorization_code", "client_credentials", "implicit"],
      }));
      expect(res.status).toBe(201);
      expect((await res.json()).grant_types).toEqual(["authorization_code"]);
      expect(vi.mocked(registerClient).mock.calls[0][0].grant_types).toEqual(["authorization_code"]);
    });

    it("rejects a registration with no supported grant type", async () => {
      const res = await POST(makeRegisterRequest({ ...validBody, grant_types: ["client_credentials"] }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_client_metadata");
      expect(registerClient).not.toHaveBeenCalled();
    });
  });

  it("truncates client_name to 80 characters", async () => {
    const longName = "a".repeat(100);
    const res = await POST(makeRegisterRequest({ ...validBody, client_name: longName }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.client_name).toBe("a".repeat(80));
  });

  it("defaults client_name to 'Unknown Client' when not provided", async () => {
    const res = await POST(makeRegisterRequest(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.client_name).toBe("Unknown Client");
  });
});
