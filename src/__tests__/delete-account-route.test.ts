import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    getCurrentUserId: vi.fn(() => null),
    validateCsrfHeader: (request: { headers: Headers }) => {
      const header = request.headers.get("x-csrf-protection");
      if (header !== "1") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    },
  };
});
vi.mock("@/lib/auth", async () => ({
  isGoogleAuthMode: vi.fn(() => true),
  SESSION_COOKIE_NAME: "annie_session",
  SESSION_MAX_AGE: 3600,
  verifySessionToken: vi.fn(async () => null),
}));
vi.mock("@/lib/token-blocklist", () => ({ revokeToken: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { getCurrentUserId } from "@/lib/api-auth";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDeleteRequest(body: object, csrfHeader = "1"): NextRequest {
  return new NextRequest("http://localhost/api/auth/delete-account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "X-CSRF-Protection": csrfHeader },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DELETE /api/auth/delete-account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockReturnValue(null);
  });

  it("returns 403 when CSRF header missing", async () => {
    const req = new NextRequest("http://localhost/api/auth/delete-account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmEmail: "a@test.com" }),
    });
    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(req);
    expect(res.status).toBe(403);
  });

  it("returns 401 when userId is null", async () => {
    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(makeDeleteRequest({ confirmEmail: "a@test.com" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when userId not found in DB", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("nonexistent-user");
    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(makeDeleteRequest({ confirmEmail: "a@test.com" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when confirmEmail is missing", async () => {
    const user = await testPrisma.user.create({
      data: { id: "del-u1", email: "del1@test.com", googleId: "del-g1" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(makeDeleteRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when confirmEmail does not match user email", async () => {
    const user = await testPrisma.user.create({
      data: { id: "del-u2", email: "del2@test.com", googleId: "del-g2" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(makeDeleteRequest({ confirmEmail: "wrong@test.com" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Email does not match/);
  });

  it("returns 200 and deletes user when email matches", async () => {
    const user = await testPrisma.user.create({
      data: { id: "del-u3", email: "del3@test.com", googleId: "del-g3" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(makeDeleteRequest({ confirmEmail: "del3@test.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const deletedUser = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(deletedUser).toBeNull();
  });

  it("clears session cookie on successful deletion", async () => {
    const user = await testPrisma.user.create({
      data: { id: "del-u4", email: "del4@test.com", googleId: "del-g4" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(makeDeleteRequest({ confirmEmail: "del4@test.com" }));
    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("annie_session=");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("cascades deletion — user consents and projects are removed", async () => {
    const user = await testPrisma.user.create({
      data: { id: "del-u5", email: "del5@test.com", googleId: "del-g5" },
    });
    await testPrisma.userConsent.create({
      data: { userId: user.id, feature: "sentry_replay", consentGiven: true },
    });
    await testPrisma.project.create({
      data: { title: "Cascade Test Project", userId: user.id },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { DELETE } = await import("@/app/api/auth/delete-account/route");
    const res = await DELETE(makeDeleteRequest({ confirmEmail: "del5@test.com" }));
    expect(res.status).toBe(200);

    const consents = await testPrisma.userConsent.findMany({ where: { userId: user.id } });
    expect(consents).toHaveLength(0);

    const projects = await testPrisma.project.findMany({ where: { userId: user.id } });
    expect(projects).toHaveLength(0);
  });
});
