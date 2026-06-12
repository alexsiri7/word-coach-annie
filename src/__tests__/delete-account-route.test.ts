import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => null),
  validateCsrfHeader: vi.fn(() => null),
}));
vi.mock("@/lib/auth", () => ({
  isGoogleAuthMode: vi.fn(() => true),
  SESSION_COOKIE_NAME: "session",
  SESSION_MAX_AGE: 3600,
  verifySessionToken: vi.fn(() => null),
}));
vi.mock("@/lib/token-blocklist", () => ({
  revokeToken: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getCurrentUserId, validateCsrfHeader } from "@/lib/api-auth";
import { isGoogleAuthMode, verifySessionToken } from "@/lib/auth";
import { revokeToken } from "@/lib/token-blocklist";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown> = {}, withCsrf = true): NextRequest {
  return new NextRequest("http://localhost/api/auth/delete-account", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(withCsrf ? { "X-CSRF-Protection": "1" } : {}),
    },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DELETE /api/auth/delete-account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockReturnValue(null);
    vi.mocked(isGoogleAuthMode).mockReturnValue(true);
    vi.mocked(validateCsrfHeader).mockReturnValue(null);
  });

  it("returns 403 without CSRF header", async () => {
    const { NextResponse } = await import("next/server");
    vi.mocked(validateCsrfHeader).mockReturnValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(makeRequest({}, false));
    expect(res.status).toBe(403);
  });

  it("returns 403 in API_TOKEN mode", async () => {
    vi.mocked(isGoogleAuthMode).mockReturnValue(false);

    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 401 when userId is null", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue(null);

    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when userId not found in DB", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("nonexistent-user");

    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 400 when email is missing", async () => {
    const user = await testPrisma.user.create({
      data: { id: "del-u1", email: "del1@test.com", googleId: "g-del1" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when email does not match", async () => {
    const user = await testPrisma.user.create({
      data: { id: "del-u2", email: "del2@test.com", googleId: "g-del2" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(makeRequest({ email: "wrong@test.com" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Email does not match");
  });

  it("deletes user and returns 200", async () => {
    const user = await testPrisma.user.create({
      data: { id: "del-u3", email: "del3@test.com", googleId: "g-del3" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(makeRequest({ email: "del3@test.com" }));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify user no longer exists
    const deleted = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(deleted).toBeNull();
  });

  it("clears session cookie in response", async () => {
    const user = await testPrisma.user.create({
      data: { id: "del-u4", email: "del4@test.com", googleId: "g-del4" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(makeRequest({ email: "del4@test.com" }));
    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("session=");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("revokes session token on successful deletion", async () => {
    const user = await testPrisma.user.create({
      data: { id: "del-u5", email: "del5@test.com", googleId: "g-del5" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);
    vi.mocked(verifySessionToken).mockResolvedValue({ jti: "jti-abc", userId: user.id, email: "del5@test.com", name: "Test" });

    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const req = new NextRequest("http://localhost/api/auth/delete-account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "X-CSRF-Protection": "1", Cookie: "session=tok123" },
      body: JSON.stringify({ email: "del5@test.com" }),
    });
    const res = await DELETE(req);

    expect(res.status).toBe(200);
    expect(vi.mocked(revokeToken)).toHaveBeenCalledWith("jti-abc", user.id, expect.any(Date));
  });

  it("still returns 200 when revokeToken throws (best-effort)", async () => {
    const user = await testPrisma.user.create({
      data: { id: "del-u6", email: "del6@test.com", googleId: "g-del6" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);
    vi.mocked(verifySessionToken).mockResolvedValue({ jti: "jti-xyz", userId: user.id, email: "del6@test.com", name: "Test" });
    vi.mocked(revokeToken).mockRejectedValue(new Error("DB down"));

    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const req = new NextRequest("http://localhost/api/auth/delete-account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "X-CSRF-Protection": "1", Cookie: "session=tok456" },
      body: JSON.stringify({ email: "del6@test.com" }),
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
  });

  it("deletes user's projects and credentials along with account", async () => {
    const user = await testPrisma.user.create({
      data: { id: "del-u7", email: "del7@test.com", googleId: "g-del7" },
    });
    const project = await testPrisma.project.create({
      data: { id: "proj-del7", title: "My Novel", userId: user.id },
    });
    await testPrisma.googleCredential.create({
      data: { userId: user.id, accessToken: "tok", refreshToken: "ref", expiresAt: new Date("2030-01-01") },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(makeRequest({ email: "del7@test.com" }));
    expect(res.status).toBe(200);

    expect(await testPrisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await testPrisma.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(await testPrisma.googleCredential.findFirst({ where: { userId: user.id } })).toBeNull();
  });

  it("returns 400 for malformed email format", async () => {
    const user = await testPrisma.user.create({
      data: { id: "del-u8", email: "del8@test.com", googleId: "g-del8" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(makeRequest({ email: "notanemail" }));
    expect(res.status).toBe(400);
  });
});
