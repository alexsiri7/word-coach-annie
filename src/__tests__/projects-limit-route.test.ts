import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => null),
}));

vi.mock("@/lib/auth", () => ({
  isGoogleAuthMode: vi.fn(() => false),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getCurrentUserId } from "@/lib/api-auth";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/projects - active project limit (HTTP level)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 with error message when user is at the default limit (3 active projects)", async () => {
    const user = await testPrisma.user.create({
      data: { email: "route-limit@test.com", googleId: "g-route-limit" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    await testPrisma.project.createMany({
      data: [
        { title: "P1", userId: user.id },
        { title: "P2", userId: user.id },
        { title: "P3", userId: user.id },
      ],
    });

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(makePostRequest({ title: "P4" }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("3 active project limit");
    expect(body.error).toContain("Archive a project");
  });

  it("returns 201 when user is below the default limit", async () => {
    const user = await testPrisma.user.create({
      data: { email: "route-below-limit@test.com", googleId: "g-route-below" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    await testPrisma.project.createMany({
      data: [
        { title: "P1", userId: user.id },
        { title: "P2", userId: user.id },
      ],
    });

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(makePostRequest({ title: "P3" }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("P3");
  });

  it("archived projects do not count toward the limit — allows creation when active count is below limit", async () => {
    const user = await testPrisma.user.create({
      data: { email: "route-archived@test.com", googleId: "g-route-archived" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    // 3 total projects but 1 is archived → 2 active < 3 limit → should allow
    await testPrisma.project.createMany({
      data: [
        { title: "Active 1", userId: user.id },
        { title: "Active 2", userId: user.id },
        { title: "Archived", userId: user.id, archivedAt: new Date() },
      ],
    });

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(makePostRequest({ title: "New Active" }));

    expect(res.status).toBe(201);
  });

  it("respects custom maxActiveProjects limit from UserAiSettings", async () => {
    const user = await testPrisma.user.create({
      data: { email: "route-custom-limit@test.com", googleId: "g-route-custom" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    // Set custom limit of 2
    await testPrisma.userAiSettings.create({
      data: { userId: user.id, maxActiveProjects: 2 },
    });

    await testPrisma.project.createMany({
      data: [
        { title: "P1", userId: user.id },
        { title: "P2", userId: user.id },
      ],
    });

    const { POST } = await import("@/app/api/projects/route");
    const res = await POST(makePostRequest({ title: "P3" }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("2 active project limit");
  });
});

describe("GET /api/projects - pagination limit capping", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  function makeGetRequest(params: Record<string, string> = {}): NextRequest {
    const url = new URL("http://localhost/api/projects");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return new NextRequest(url.toString());
  }

  it("caps limit at 200 when caller passes a huge value", async () => {
    const { GET } = await import("@/app/api/projects/route");
    const res = await GET(makeGetRequest({ limit: "99999" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects.length).toBeLessThanOrEqual(200);
  });

  it("uses default limit of 20 when limit is NaN", async () => {
    const { GET } = await import("@/app/api/projects/route");
    const res = await GET(makeGetRequest({ limit: "abc" }));
    expect(res.status).toBe(200);
  });

  it("treats limit=0 as default (parseInt(0)||20 === 20) and returns 200", async () => {
    // Note: parseInt("0") = 0, and 0 || 20 = 20 because 0 is falsy,
    // so limit=0 falls back to the default of 20 (not clamped to 1)
    const { GET } = await import("@/app/api/projects/route");
    const res = await GET(makeGetRequest({ limit: "0" }));
    expect(res.status).toBe(200);
  });

  it("clamps limit to 1 when caller passes a negative value", async () => {
    await testPrisma.project.createMany({
      data: [{ title: "X" }, { title: "Y" }],
    });
    const { GET } = await import("@/app/api/projects/route");
    const res = await GET(makeGetRequest({ limit: "-5" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects.length).toBe(1);
  });

  it("clamps offset to 0 when caller passes a negative offset", async () => {
    const { GET } = await import("@/app/api/projects/route");
    const res = await GET(makeGetRequest({ offset: "-50" }));
    expect(res.status).toBe(200);
  });
});
