import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => null),
}));

vi.mock("@/lib/export-json", () => ({
  exportProjectJson: vi.fn(async (id: string) => ({
    exportVersion: 1,
    project: { id, title: "Exported" },
    structureNodes: [],
    contentVersions: [],
    storyObjects: [],
  })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getCurrentUserId } from "@/lib/api-auth";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGetRequest(): NextRequest {
  return new NextRequest("http://localhost/api/projects/export-all", {
    method: "GET",
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/projects/export-all", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockReturnValue(null);
  });

  it("returns 404 when no userId and no unowned projects (API_TOKEN mode)", async () => {
    const { GET } = await import("@/app/api/projects/export-all/route");
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(404);
  });

  it("returns 404 when user has 0 projects", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("user-no-projects");
    const { GET } = await import("@/app/api/projects/export-all/route");
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(404);
  });

  it("returns ZIP with projects for authenticated user", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("user-zip");
    const user = await testPrisma.user.create({
      data: { id: "user-zip", email: "zip@test.com", googleId: "g-zip" },
    });
    await testPrisma.project.create({ data: { title: "Project A", author: "Author", userId: user.id } });
    await testPrisma.project.create({ data: { title: "Project B", author: "Author", userId: user.id } });

    const { GET } = await import("@/app/api/projects/export-all/route");
    const res = await GET(makeGetRequest());

    expect(res.status).toBe(200);

    const body = Buffer.from(await res.arrayBuffer());
    expect(body.length).toBeGreaterThan(0);
    // ZIP magic bytes: PK\x03\x04
    expect(body[0]).toBe(0x50);
    expect(body[1]).toBe(0x4b);
  });

  it("response has correct content-type and content-disposition headers", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("user-headers");
    const user = await testPrisma.user.create({
      data: { id: "user-headers", email: "headers@test.com", googleId: "g-headers" },
    });
    await testPrisma.project.create({ data: { title: "Solo Project", author: "Author", userId: user.id } });

    const { GET } = await import("@/app/api/projects/export-all/route");
    const res = await GET(makeGetRequest());

    expect(res.headers.get("content-type")).toContain("application/zip");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-disposition")).toContain("annie-export-");
    expect(res.headers.get("content-disposition")).toContain(".zip");
  });

  it("scopes to user when userId is present", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("user-abc");

    // Create a project owned by a different user — should not appear
    const otherUser = await testPrisma.user.create({
      data: { id: "other-user", email: "other@test.com", googleId: "g-other" },
    });
    await testPrisma.project.create({
      data: { title: "Other Project", author: "Other", userId: otherUser.id },
    });

    const { GET } = await import("@/app/api/projects/export-all/route");
    const res = await GET(makeGetRequest());

    // user-abc has no projects, so should get 404
    expect(res.status).toBe(404);
  });
});
