import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { NextRequest, NextResponse } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => null),
  verifyProjectReadAccess: vi.fn(async () => ({ authorized: true })),
  verifyProjectWriteAccess: vi.fn(async () => ({ authorized: true })),
}));

import { verifyProjectWriteAccess } from "@/lib/api-auth";

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

function makePatchRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeDeleteRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method: "DELETE" });
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

    it("returns 404 when projectId references non-existent project", async () => {
      const { POST } = await import("@/app/api/writing-tasks/route");
      const res = await POST(
        makePostRequest("/api/writing-tasks", {
          projectId: "nonexistent-id",
          name: "Some task",
        })
      );
      expect(res.status).toBe(404);
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

    it("returns 404 when projectId references non-existent project", async () => {
      const { GET } = await import("@/app/api/writing-tasks/route");
      const res = await GET(makeGetRequest("/api/writing-tasks?projectId=nonexistent-id"));
      expect(res.status).toBe(404);
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

  describe("PATCH /api/writing-tasks/[id]", () => {
    let taskId: string;

    beforeEach(async () => {
      const task = await testPrisma.writingTask.create({
        data: { projectId, name: "Original name" },
      });
      taskId = task.id;
    });

    it("updates task name and returns 200", async () => {
      const { PATCH } = await import("@/app/api/writing-tasks/[id]/route");
      const res = await PATCH(
        makePatchRequest(`/api/writing-tasks/${taskId}`, { name: "Updated name" }),
        { params: Promise.resolve({ id: taskId }) }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("Updated name");
    });

    it("returns 404 for non-existent task", async () => {
      const { PATCH } = await import("@/app/api/writing-tasks/[id]/route");
      const res = await PATCH(
        makePatchRequest("/api/writing-tasks/nonexistent", { name: "x" }),
        { params: Promise.resolve({ id: "nonexistent" }) }
      );
      expect(res.status).toBe(404);
    });

    it("returns 400 for empty update body", async () => {
      const { PATCH } = await import("@/app/api/writing-tasks/[id]/route");
      const res = await PATCH(
        makePatchRequest(`/api/writing-tasks/${taskId}`, {}),
        { params: Promise.resolve({ id: taskId }) }
      );
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/writing-tasks/[id]", () => {
    it("deletes task and returns { success: true }", async () => {
      const task = await testPrisma.writingTask.create({
        data: { projectId, name: "To delete" },
      });
      const { DELETE } = await import("@/app/api/writing-tasks/[id]/route");
      const res = await DELETE(
        makeDeleteRequest(`/api/writing-tasks/${task.id}`),
        { params: Promise.resolve({ id: task.id }) }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      const gone = await testPrisma.writingTask.findUnique({ where: { id: task.id } });
      expect(gone).toBeNull();
    });

    it("returns 404 for non-existent task", async () => {
      const { DELETE } = await import("@/app/api/writing-tasks/[id]/route");
      const res = await DELETE(
        makeDeleteRequest("/api/writing-tasks/nonexistent"),
        { params: Promise.resolve({ id: "nonexistent" }) }
      );
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/writing-tasks filters", () => {
    it("filters by energy type", async () => {
      await testPrisma.writingTask.create({ data: { projectId, name: "Dramatic task", energy: "Dramatic" } });
      await testPrisma.writingTask.create({ data: { projectId, name: "Technical task", energy: "Technical" } });

      const { GET } = await import("@/app/api/writing-tasks/route");
      const res = await GET(makeGetRequest(`/api/writing-tasks?projectId=${projectId}&energy=Dramatic`));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tasks).toHaveLength(1);
      expect(body.tasks[0].name).toBe("Dramatic task");
    });

    it("filters by completed=false (open tasks only)", async () => {
      await testPrisma.writingTask.create({ data: { projectId, name: "Open", completed: false } });
      await testPrisma.writingTask.create({ data: { projectId, name: "Done", completed: true } });

      const { GET } = await import("@/app/api/writing-tasks/route");
      const res = await GET(makeGetRequest(`/api/writing-tasks?projectId=${projectId}&completed=false`));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tasks).toHaveLength(1);
      expect(body.tasks[0].name).toBe("Open");
    });
  });

  describe("Access control rejection", () => {
    it("returns 403 when user lacks write access to POST /writing-tasks", async () => {
      vi.mocked(verifyProjectWriteAccess).mockResolvedValueOnce({
        authorized: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      });

      const { POST } = await import("@/app/api/writing-tasks/route");
      const res = await POST(
        makePostRequest("/api/writing-tasks", { projectId, name: "Task" })
      );
      expect(res.status).toBe(403);
    });
  });
});
