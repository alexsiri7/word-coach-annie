import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    project: {
      findUnique: vi.fn().mockResolvedValue({
        id: "proj-1",
        title: "Test Novel",
        synopsis: "A test story",
        genre: "Fantasy",
      }),
    },
    structureNode: {
      findMany: vi.fn().mockResolvedValue([
        { id: "ch1", type: "CHAPTER", title: "Chapter One", parentId: null, status: "DRAFT", synopsis: "", orderIndex: 0, contentVersions: [] },
        { id: "sc1", type: "SCENE", title: "Opening Scene", parentId: "ch1", status: "DRAFT", synopsis: "The beginning", orderIndex: 0, contentVersions: [{ content: "<p>Once upon a time...</p>", wordCount: 4 }] },
      ]),
    },
    storyObject: {
      findMany: vi.fn().mockResolvedValue([
        { id: "char1", type: "CHARACTER", name: "Alice", description: "The protagonist", role: "Protagonist" },
        { id: "plot1", type: "PLOTLINE", name: "Main Quest", description: "The hero's journey" },
      ]),
    },
    relationship: {
      findMany: vi.fn().mockResolvedValue([
        { id: "rel1", type: "ALLY", fromObject: { name: "Alice", type: "CHARACTER" }, toObject: { name: "Bob", type: "CHARACTER" } },
      ]),
    },
  },
}));

vi.mock("@/lib/ai/settings", () => ({
  getAiConfig: vi.fn().mockResolvedValue({

    apiKey: "test-key",
    model: "test-model",
  }),
  getAiPreferences: vi.fn().mockResolvedValue({
    customInstructions: "",
    coachingStyle: "balanced",
    responseLength: "moderate",
  }),
  buildPreferenceInstructions: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn().mockReturnValue("user-1"),
  verifyProjectAccess: vi.fn().mockResolvedValue({
    authorized: true,
    project: { id: "proj-1", userId: "user-1" },
    role: "OWNER" as const,
  }),
}));

vi.mock("@/lib/ai/adk-agent", () => ({
  runSimpleCompletion: vi.fn().mockResolvedValue("Analysis result text"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { POST } from "@/app/api/ai-manuscript/route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/ai-manuscript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai-manuscript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when projectId is missing", async () => {
    const req = makeRequest({ analysisType: "plot-threads" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it("returns 400 when analysisType is missing", async () => {
    const req = makeRequest({ projectId: "proj-1" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it("returns 400 for unknown analysisType", async () => {
    const req = makeRequest({ projectId: "proj-1", analysisType: "unknown-type" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unknown/i);
  });

  it("returns result for plot-threads analysis", async () => {
    const req = makeRequest({ projectId: "proj-1", analysisType: "plot-threads" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBe("Analysis result text");
    expect(body.analysisType).toBe("plot-threads");
  });

  it("returns result for character-arcs analysis", async () => {
    const req = makeRequest({ projectId: "proj-1", analysisType: "character-arcs" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBe("Analysis result text");
    expect(body.analysisType).toBe("character-arcs");
  });

  it("returns result for consistency-check analysis", async () => {
    const req = makeRequest({ projectId: "proj-1", analysisType: "consistency-check" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBe("Analysis result text");
    expect(body.analysisType).toBe("consistency-check");
  });

  it("returns 503 when AI is not configured", async () => {
    const { getAiConfig } = await import("@/lib/ai/settings");
    vi.mocked(getAiConfig).mockResolvedValueOnce({ apiKey: "", model: "" });
    const req = makeRequest({ projectId: "proj-1", analysisType: "plot-threads" });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it("returns 500 when project is not found", async () => {
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(null);
    const req = makeRequest({ projectId: "nonexistent", analysisType: "plot-threads" });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
