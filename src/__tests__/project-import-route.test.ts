import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => null),
}));

vi.mock("@/lib/import-json", () => ({
  importProjectJson: vi.fn(async () => ({ projectId: "imported-id" })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getCurrentUserId } from "@/lib/api-auth";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePostRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/projects/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/projects/import", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockReturnValue(null);

    // Create a project with the expected ID so prisma.project.findUnique succeeds
    await testPrisma.project.create({
      data: { id: "imported-id", title: "Imported", author: "Author" },
    });
  });

  it("returns 201 for valid import payload", async () => {
    const { POST } = await import("@/app/api/projects/import/route");
    const res = await POST(makePostRequest({
      exportVersion: 1,
      project: { title: "My Novel", author: "Author" },
    }));
    expect(res.status).toBe(201);
  });

  it("returns 400 when project field is missing", async () => {
    const { POST } = await import("@/app/api/projects/import/route");
    const res = await POST(makePostRequest({ exportVersion: 1 }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("missing");
  });

  it("returns 400 when exportVersion field is missing", async () => {
    const { POST } = await import("@/app/api/projects/import/route");
    const res = await POST(makePostRequest({
      project: { title: "My Novel" },
    }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("missing");
  });

  it("returns 400 for empty body", async () => {
    const { POST } = await import("@/app/api/projects/import/route");
    const req = new NextRequest("http://localhost/api/projects/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json {{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("uses getCurrentUserId from the request", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("user-abc");
    const { POST } = await import("@/app/api/projects/import/route");
    await POST(makePostRequest({
      exportVersion: 1,
      project: { title: "My Novel", author: "Author" },
    }));
    expect(getCurrentUserId).toHaveBeenCalled();
  });
});
