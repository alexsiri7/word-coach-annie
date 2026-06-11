import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { NextRequest, NextResponse } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// validateCsrfHeader is inlined rather than using importOriginal because bun/vitest
// does not support importOriginal with this module structure. The inline logic
// mirrors the real implementation exactly — update both if the header name or
// expected value ever changes.
vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => null),
  validateCsrfHeader: (request: NextRequest) => {
    const header = request.headers.get("x-csrf-protection");
    if (header !== "1") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { getCurrentUserId } from "@/lib/api-auth";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGetRequest(): NextRequest {
  return new NextRequest("http://localhost/api/account/consent", { method: "GET" });
}
function makePutRequest(body: object): NextRequest {
  return new NextRequest("http://localhost/api/account/consent", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-CSRF-Protection": "1" },
    body: JSON.stringify(body),
  });
}

// ── GET tests ─────────────────────────────────────────────────────────────────

describe("GET /api/account/consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockReturnValue(null);
  });

  it("returns 401 for unauthenticated user", async () => {
    const { GET } = await import("@/app/api/account/consent/route");
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  it("returns empty array when authenticated user has no consent records", async () => {
    const user = await testPrisma.user.create({
      data: { id: "u1", email: "a@test.com", googleId: "g1" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { GET } = await import("@/app/api/account/consent/route");
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns consent rows for authenticated user", async () => {
    const user = await testPrisma.user.create({
      data: { id: "u2", email: "b@test.com", googleId: "g2" },
    });
    await testPrisma.userConsent.create({
      data: { userId: user.id, feature: "sentry_replay", consentGiven: false },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { GET } = await import("@/app/api/account/consent/route");
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].feature).toBe("sentry_replay");
    expect(rows[0].consentGiven).toBe(false);
  });
});

// ── PUT tests ─────────────────────────────────────────────────────────────────

describe("PUT /api/account/consent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockReturnValue(null);
  });

  it("returns 403 when CSRF header is missing", async () => {
    const req = new NextRequest("http://localhost/api/account/consent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feature: "sentry_replay", consentGiven: true }),
    });
    const { PUT } = await import("@/app/api/account/consent/route");
    const res = await PUT(req);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
  });

  it("returns 401 for unauthenticated request", async () => {
    const { PUT } = await import("@/app/api/account/consent/route");
    const res = await PUT(makePutRequest({ feature: "sentry_replay", consentGiven: false }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing consentGiven field", async () => {
    const user = await testPrisma.user.create({
      data: { id: "u3", email: "c@test.com", googleId: "g3" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { PUT } = await import("@/app/api/account/consent/route");
    const res = await PUT(makePutRequest({ feature: "sentry_replay" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid body/);
  });

  it("returns 400 for non-boolean consentGiven", async () => {
    const user = await testPrisma.user.create({
      data: { id: "u4", email: "d@test.com", googleId: "g4" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { PUT } = await import("@/app/api/account/consent/route");
    const res = await PUT(makePutRequest({ feature: "sentry_replay", consentGiven: "yes" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown feature", async () => {
    const user = await testPrisma.user.create({
      data: { id: "u5", email: "e@test.com", googleId: "g5" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { PUT } = await import("@/app/api/account/consent/route");
    const res = await PUT(makePutRequest({ feature: "unknown_feature", consentGiven: true }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unknown feature/);
  });

  it("upserts consent record for valid sentry_replay request", async () => {
    const user = await testPrisma.user.create({
      data: { id: "u6", email: "f@test.com", googleId: "g6" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { PUT } = await import("@/app/api/account/consent/route");
    const res = await PUT(makePutRequest({ feature: "sentry_replay", consentGiven: false }));
    expect(res.status).toBe(200);

    const row = await testPrisma.userConsent.findUnique({
      where: { userId_feature: { userId: user.id, feature: "sentry_replay" } },
    });
    expect(row?.consentGiven).toBe(false);
  });

  it("upserts consent record for valid claude_api request", async () => {
    const user = await testPrisma.user.create({
      data: { id: "u7", email: "g@test.com", googleId: "g7" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    const { PUT } = await import("@/app/api/account/consent/route");
    const res = await PUT(makePutRequest({ feature: "claude_api", consentGiven: true }));
    expect(res.status).toBe(200);

    const row = await testPrisma.userConsent.findUnique({
      where: { userId_feature: { userId: user.id, feature: "claude_api" } },
    });
    expect(row?.consentGiven).toBe(true);
  });

  it("second PUT updates existing record (upsert semantics)", async () => {
    const user = await testPrisma.user.create({
      data: { id: "u8", email: "h@test.com", googleId: "g8" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);
    await testPrisma.userConsent.create({
      data: { userId: user.id, feature: "sentry_replay", consentGiven: true },
    });

    const { PUT } = await import("@/app/api/account/consent/route");
    await PUT(makePutRequest({ feature: "sentry_replay", consentGiven: false }));

    const row = await testPrisma.userConsent.findUnique({
      where: { userId_feature: { userId: user.id, feature: "sentry_replay" } },
    });
    expect(row?.consentGiven).toBe(false);
  });
});
