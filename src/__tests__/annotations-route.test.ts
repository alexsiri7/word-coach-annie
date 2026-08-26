import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => "user-1"),
  verifyProjectReadAccessByNode: vi.fn(async () => ({ authorized: true, projectId: "proj-1", role: "READER" })),
}));

vi.mock("@/lib/controllers/structure", () => ({
  ANNOTATION_ERRORS: { CONTENT_REQUIRED: "Content is required" },
  StructureController: {
    addAnnotation: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/sanitize-server", () => ({
  sanitizeInput: vi.fn((s: string) => s),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    annotation: {
      findMany: vi.fn(async () => []),
    },
  },
}));

import { StructureController, ANNOTATION_ERRORS } from "@/lib/controllers/structure";
import { verifyProjectReadAccessByNode } from "@/lib/api-auth";

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/nodes/node-1/annotations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockParams(nodeId: string) {
  return { params: Promise.resolve({ id: nodeId }) };
}

describe("POST /api/nodes/[id]/annotations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 with 'Content is required' when that validation error is thrown", async () => {
    vi.mocked(StructureController.addAnnotation).mockRejectedValue(
      new Error(ANNOTATION_ERRORS.CONTENT_REQUIRED)
    );
    const { POST } = await import("@/app/api/nodes/[id]/annotations/route");
    const res = await POST(makePostRequest({ content: "" }), mockParams("node-1"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Content is required");
  });

  it("returns 500 with generic message for unexpected errors without leaking details", async () => {
    vi.mocked(StructureController.addAnnotation).mockRejectedValue(
      new Error("FATAL: relation \"annotations\" does not exist")
    );
    const { POST } = await import("@/app/api/nodes/[id]/annotations/route");
    const res = await POST(makePostRequest({ content: "some note" }), mockParams("node-1"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Internal server error");
    expect(body.error).not.toContain("relation");
    expect(body.error).not.toContain("annotations");
  });

  it("does not leak internal error messages for non-Error throws", async () => {
    vi.mocked(StructureController.addAnnotation).mockRejectedValue("raw string error");
    const { POST } = await import("@/app/api/nodes/[id]/annotations/route");
    const res = await POST(makePostRequest({ content: "note" }), mockParams("node-1"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });

  it("allows a READER-role user to POST an annotation successfully (regression guard)", async () => {
    vi.mocked(verifyProjectReadAccessByNode).mockResolvedValue({ authorized: true, projectId: "proj-1", role: "READER" });
    vi.mocked(StructureController.addAnnotation).mockResolvedValue({ id: "ann-1", content: "Good point" } as never);
    const { POST } = await import("@/app/api/nodes/[id]/annotations/route");
    const res = await POST(makePostRequest({ content: "Good point" }), mockParams("node-1"));

    expect(res.status).toBe(201);
  });

  it("returns 403 when verifyProjectReadAccessByNode denies access", async () => {
    vi.mocked(verifyProjectReadAccessByNode).mockResolvedValue({
      authorized: false,
      response: new NextResponse(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    });
    const { POST } = await import("@/app/api/nodes/[id]/annotations/route");
    const res = await POST(makePostRequest({ content: "note" }), mockParams("node-1"));

    expect(res.status).toBe(403);
  });
});
