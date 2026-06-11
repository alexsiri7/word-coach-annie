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
import { isGoogleAuthMode } from "@/lib/auth";

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
});
