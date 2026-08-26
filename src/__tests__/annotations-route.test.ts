import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => "user-1"),
  verifyProjectReadAccessByNode: vi.fn(async () => ({ authorized: true })),
  verifyProjectWriteAccessByNode: vi.fn(async () => ({ authorized: true })),
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

  it("passes range string through to StructureController.addAnnotation", async () => {
    const rangePayload = JSON.stringify({
      type: "textQuote",
      selectedText: "fox",
      prefix: "quick ",
      suffix: " jumps",
    });
    vi.mocked(StructureController.addAnnotation).mockResolvedValue({
      id: "ann-1",
      nodeId: "node-1",
      content: "note",
      range: rangePayload,
      resolved: false,
      selectedText: "fox",
      externalId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { POST } = await import("@/app/api/nodes/[id]/annotations/route");
    await POST(
      makePostRequest({ content: "note", range: rangePayload, selectedText: "fox" }),
      mockParams("node-1")
    );
    expect(StructureController.addAnnotation).toHaveBeenCalledWith(
      "node-1",      // nodeId
      "note",        // content (sanitized)
      rangePayload,  // range — the TextQuoteRange JSON string
      "fox"          // selectedText
    );
  });
});
