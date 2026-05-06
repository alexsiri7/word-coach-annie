import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/oauth-store", () => ({
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

import { registerClient, countClientsByIpInWindow, countTotalClients } from "@/lib/oauth-store";
import { checkRateLimit } from "@/lib/rate-limit";
import { isAuthEnabled } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/api-auth";
import { POST } from "@/app/oauth/register/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRegisterRequest(body: Record<string, unknown>, ip = "1.2.3.4"): NextRequest {
  return new NextRequest("http://localhost/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const validBody = { redirect_uris: ["http://localhost:3000/cb"] };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /oauth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, remaining: 5, resetMs: 0 });
    vi.mocked(countClientsByIpInWindow).mockResolvedValue(0);
    vi.mocked(countTotalClients).mockResolvedValue(0);
  });

  it("returns 201 with client_id on valid registration", async () => {
    const res = await POST(makeRegisterRequest(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.client_id).toBeTruthy();
    expect(body.redirect_uris).toEqual(["http://localhost:3000/cb"]);
    expect(vi.mocked(registerClient)).toHaveBeenCalledWith(
      expect.objectContaining({ redirect_uris: ["http://localhost:3000/cb"] }),
      { ip: "1.2.3.4", userId: undefined }
    );
  });

  it("returns 429 when in-memory rate limit exceeded", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({
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

  it("returns 400 when redirect_uris missing", async () => {
    const res = await POST(makeRegisterRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when redirect_uri uses plain HTTP (non-localhost)", async () => {
    const res = await POST(makeRegisterRequest({ redirect_uris: ["http://evil.com/cb"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when more than 5 redirect_uris provided", async () => {
    const uris = Array.from({ length: 6 }, (_, i) => `https://app${i}.example.com/cb`);
    const res = await POST(makeRegisterRequest({ redirect_uris: uris }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_client_metadata");
  });
});

describe("POST /oauth/register — auth-enabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true, remaining: 5, resetMs: 0 });
    vi.mocked(countClientsByIpInWindow).mockResolvedValue(0);
    vi.mocked(countTotalClients).mockResolvedValue(0);
  });

  it("returns 401 when auth is enabled and no session", async () => {
    vi.mocked(isAuthEnabled).mockReturnValue(true);
    vi.mocked(getCurrentUserId).mockReturnValue(null);
    const res = await POST(makeRegisterRequest(validBody));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("invalid_client_metadata");
  });

  it("returns 201 when auth is enabled and session is present", async () => {
    vi.mocked(isAuthEnabled).mockReturnValue(true);
    vi.mocked(getCurrentUserId).mockReturnValue("user-123");
    const res = await POST(makeRegisterRequest(validBody));
    expect(res.status).toBe(201);
    expect(vi.mocked(registerClient)).toHaveBeenCalledWith(
      expect.objectContaining({ redirect_uris: ["http://localhost:3000/cb"] }),
      { ip: "1.2.3.4", userId: "user-123" }
    );
  });
});
