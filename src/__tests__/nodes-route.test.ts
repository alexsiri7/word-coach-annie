import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => "user-1"),
  verifyProjectReadAccess: vi.fn(async () => ({ authorized: true })),
  verifyProjectWriteAccess: vi.fn(async () => ({ authorized: true })),
}));

vi.mock("@/lib/controllers/structure", () => ({
  StructureController: {
    getOutline: vi.fn(async () => []),
    createNode: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { StructureController } from "@/lib/controllers/structure";

// A valid body that passes NodeCreateSchema validation
const validBody = { type: "CHAPTER", title: "Test Chapter" };

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/projects/proj-1/nodes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockParams(projectId: string) {
  return { params: Promise.resolve({ id: projectId }) };
}

describe("POST /api/projects/[id]/nodes - error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 with generic message for invalid type error without leaking enum values", async () => {
    vi.mocked(StructureController.createNode).mockRejectedValue(
      new Error("type must be one of: chapter, scene, beat")
    );
    const { POST } = await import("@/app/api/projects/[id]/nodes/route");
    const res = await POST(makePostRequest(validBody), mockParams("proj-1"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid node type or status");
    expect(body.error).not.toContain("chapter");
    expect(body.error).not.toContain("scene");
  });

  it("returns 400 for status must be error without leaking internal values", async () => {
    vi.mocked(StructureController.createNode).mockRejectedValue(
      new Error("status must be one of: draft, published")
    );
    const { POST } = await import("@/app/api/projects/[id]/nodes/route");
    const res = await POST(makePostRequest(validBody), mockParams("proj-1"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid node type or status");
    expect(body.error).not.toContain("draft");
  });

  it("returns 400 for parent not found error", async () => {
    vi.mocked(StructureController.createNode).mockRejectedValue(
      new Error("Parent node not found")
    );
    const { POST } = await import("@/app/api/projects/[id]/nodes/route");
    const res = await POST(makePostRequest(validBody), mockParams("proj-1"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Parent node not found");
  });

  it("returns 404 for project not found error", async () => {
    vi.mocked(StructureController.createNode).mockRejectedValue(
      new Error("Project not found")
    );
    const { POST } = await import("@/app/api/projects/[id]/nodes/route");
    const res = await POST(makePostRequest(validBody), mockParams("missing-proj"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Project not found");
  });

  it("returns 500 for unexpected errors without leaking internal details", async () => {
    vi.mocked(StructureController.createNode).mockRejectedValue(
      new Error("connection timeout to db-host-internal:5432")
    );
    const { POST } = await import("@/app/api/projects/[id]/nodes/route");
    const res = await POST(makePostRequest(validBody), mockParams("proj-1"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Internal server error");
    expect(body.error).not.toContain("db-host-internal");
    expect(body.error).not.toContain("5432");
  });
});
