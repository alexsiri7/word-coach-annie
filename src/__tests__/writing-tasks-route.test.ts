import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => null),
  verifyProjectReadAccess: vi.fn(async () => ({ authorized: true })),
  verifyProjectWriteAccess: vi.fn(async () => ({ authorized: true })),
}));

vi.mock("@/lib/sanitize-server", () => ({
  sanitizeInput: vi.fn((s: string) => s),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method: "GET" });
}

function makePostRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Writing Tasks API", () => {
  let projectId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const project = await testPrisma.project.create({
      data: { title: "Test Project", author: "Author" },
    });
    projectId = project.id;
  });

  describe("POST /api/writing-tasks", () => {
    it("creates task successfully and returns 201", async () => {
      const { POST } = await import("@/app/api/writing-tasks/route");
      const res = await POST(
        makePostRequest("/api/writing-tasks", {
          projectId,
          name: "Revise opening scene",
          energy: "Introspective",
        })
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("Revise opening scene");
      expect(body.energy).toBe("Introspective");
      expect(body.completed).toBe(false);
    });

    it("returns 400 when projectId is missing", async () => {
      const { POST } = await import("@/app/api/writing-tasks/route");
      const res = await POST(
        makePostRequest("/api/writing-tasks", {
          name: "Some task",
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when name is empty", async () => {
      const { POST } = await import("@/app/api/writing-tasks/route");
      const res = await POST(
        makePostRequest("/api/writing-tasks", {
          projectId,
          name: "",
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/writing-tasks", () => {
    it("returns task list for project", async () => {
      await testPrisma.writingTask.create({
        data: { projectId, name: "Task A" },
      });
      await testPrisma.writingTask.create({
        data: { projectId, name: "Task B", completed: true },
      });

      const { GET } = await import("@/app/api/writing-tasks/route");
      const res = await GET(makeGetRequest(`/api/writing-tasks?projectId=${projectId}`));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tasks).toHaveLength(2);
      expect(body.total).toBe(2);
    });

    it("returns 400 when projectId is missing", async () => {
      const { GET } = await import("@/app/api/writing-tasks/route");
      const res = await GET(makeGetRequest("/api/writing-tasks"));
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/writing-tasks/[id]/complete", () => {
    it("marks task as complete", async () => {
      const task = await testPrisma.writingTask.create({
        data: { projectId, name: "Draft chapter 3" },
      });

      const { POST } = await import("@/app/api/writing-tasks/[id]/complete/route");
      const res = await POST(
        makePostRequest(`/api/writing-tasks/${task.id}/complete`),
        { params: Promise.resolve({ id: task.id }) }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.completed).toBe(true);
    });

    it("returns 404 for non-existent task", async () => {
      const { POST } = await import("@/app/api/writing-tasks/[id]/complete/route");
      const res = await POST(
        makePostRequest("/api/writing-tasks/nonexistent/complete"),
        { params: Promise.resolve({ id: "nonexistent" }) }
      );
      expect(res.status).toBe(404);
    });
  });
});
