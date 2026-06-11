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

  it("enforces the limit even under concurrent requests (simulated TOCTOU)", async () => {
    const user = await testPrisma.user.create({
      data: { email: "concurrent-limit@test.com", googleId: "g-concurrent" },
    });
    vi.mocked(getCurrentUserId).mockReturnValue(user.id);

    // Fill up to limit - 1
    await testPrisma.project.createMany({
      data: [
        { title: "P1", userId: user.id },
        { title: "P2", userId: user.id },
      ],
    });

    const { POST } = await import("@/app/api/projects/route");

    // Simulate interleaved requests — both async chains start before either write commits,
    // which exercises the serializable-transaction guard.
    // Note: Node.js is single-threaded so true simultaneity isn't guaranteed; the P2034
    // serialization-failure (409) path may not be exercised in every run — see test name.
    const [res1, res2] = await Promise.all([
      POST(makePostRequest({ title: "Concurrent A" })),
      POST(makePostRequest({ title: "Concurrent B" })),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // One should succeed (201), the other should fail (403 limit OR 409 serialization conflict)
    expect(statuses[0]).toBe(201);
    expect([403, 409]).toContain(statuses[1]);

    // Confirm DB has exactly 3 active projects
    const finalCount = await testPrisma.project.count({
      where: { userId: user.id, archivedAt: null },
    });
    expect(finalCount).toBe(3);
  });

  it("skips the limit check and creates a project for unauthenticated (API_TOKEN/dev) requests", async () => {
    // Arrange — no userId (API_TOKEN / dev mode); null is the default from the top-level mock
    vi.mocked(getCurrentUserId).mockReturnValue(null);

    const { POST } = await import("@/app/api/projects/route");

    // Act
    const res = await POST(makePostRequest({ title: "Dev Project" }));

    // Assert
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("Dev Project");
    expect(body.userId).toBeNull();
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
