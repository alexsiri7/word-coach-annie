import { describe, it, expect, beforeEach, vi } from "vitest";
import "./setup";

vi.mock("next/server", () => {
  const nr = class {
    body: string;
    status: number;
    constructor(body: string, init?: { status: number }) {
      this.body = body;
      this.status = init?.status || 200;
    }
    static json(data: unknown, init?: { status?: number }) {
      return { data, status: init?.status || 200, async json() { return data; } };
    }
  };
  return { NextResponse: nr };
});

function mockParams<T>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}

import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController } from "@/lib/controllers/structure";
import { SessionsController } from "@/lib/controllers/sessions";
import { ProgressController } from "@/lib/controllers/progress";

describe("SessionsController", () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await ProjectsController.createProject({ title: "Test Project" });
    projectId = project.id;
  });

  it("creates a writing session", async () => {
    const session = await SessionsController.createSession({
      projectId,
      wordsWritten: 350,
      durationSeconds: 1200,
      date: "2026-03-29",
    });
    expect(session.id).toBeTruthy();
    expect(session.projectId).toBe(projectId);
    expect(session.wordsWritten).toBe(350);
    expect(session.durationSeconds).toBe(1200);
    expect(session.date).toBe("2026-03-29");
  });

  it("returns global heatmap for past 28 days", async () => {
    await SessionsController.createSession({
      projectId,
      wordsWritten: 500,
      date: new Date().toISOString().slice(0, 10),
    });

    const heatmap = await SessionsController.getGlobalHeatmap(28);
    expect(heatmap).toHaveLength(28);

    const today = new Date().toISOString().slice(0, 10);
    const todayEntry = heatmap.find((d) => d.date === today);
    expect(todayEntry?.wordsWritten).toBe(500);
    expect(todayEntry?.sessions).toBe(1);
  });

  it("aggregates multiple sessions for same day", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await SessionsController.createSession({ projectId, wordsWritten: 200, date: today });
    await SessionsController.createSession({ projectId, wordsWritten: 300, date: today });

    const heatmap = await SessionsController.getGlobalHeatmap(28);
    const todayEntry = heatmap.find((d) => d.date === today);
    expect(todayEntry?.wordsWritten).toBe(500);
    expect(todayEntry?.sessions).toBe(2);
  });

  it("returns days with zero words for inactive days", async () => {
    const heatmap = await SessionsController.getGlobalHeatmap(7);
    expect(heatmap).toHaveLength(7);
    expect(heatmap.every((d) => d.wordsWritten === 0)).toBe(true);
  });
});

describe("ProgressController", () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await ProjectsController.createProject({ title: "Novel" });
    projectId = project.id;
  });

  it("returns zero progress for empty project", async () => {
    const prog = await ProgressController.getProjectProgress(projectId);
    expect(prog.totalScenes).toBe(0);
    expect(prog.totalWords).toBe(0);
    expect(prog.nextScene).toBeNull();
  });

  it("counts scenes by status", async () => {
    const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
    const s1 = await StructureController.createNode({ projectId, type: "SCENE", title: "S1", parentId: ch.id });
    const s2 = await StructureController.createNode({ projectId, type: "SCENE", title: "S2", parentId: ch.id });
    const s3 = await StructureController.createNode({ projectId, type: "SCENE", title: "S3", parentId: ch.id });

    // Update statuses
    await StructureController.updateNode(s1.id, { status: "DRAFT" });
    await StructureController.updateNode(s2.id, { status: "REVISED" });
    await StructureController.updateNode(s3.id, { status: "FINAL" });

    const prog = await ProgressController.getProjectProgress(projectId);
    expect(prog.totalScenes).toBe(3);
    expect(prog.draftedScenes).toBe(1);
    expect(prog.revisedScenes).toBe(1);
    expect(prog.finalScenes).toBe(1);
    expect(prog.outlineScenes).toBe(0);
  });

  it("identifies the next unwritten scene", async () => {
    const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
    const s1 = await StructureController.createNode({ projectId, type: "SCENE", title: "S1", parentId: ch.id });
    await StructureController.createNode({ projectId, type: "SCENE", title: "S2", parentId: ch.id });
    await StructureController.updateNode(s1.id, { status: "FINAL" });

    const prog = await ProgressController.getProjectProgress(projectId);
    expect(prog.nextScene).not.toBeNull();
    expect(prog.nextScene!.title).toBe("S2");
    expect(prog.nextScene!.status).toBe("OUTLINE");
  });

  it("returns null nextScene when all scenes are final", async () => {
    const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
    const s1 = await StructureController.createNode({ projectId, type: "SCENE", title: "S1", parentId: ch.id });
    await StructureController.updateNode(s1.id, { status: "FINAL" });

    const prog = await ProgressController.getProjectProgress(projectId);
    expect(prog.nextScene).toBeNull();
  });

  it("builds part-level progress breakdown", async () => {
    const part = await StructureController.createNode({ projectId, type: "PART", title: "Part 1" });
    const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1", parentId: part.id });
    const s1 = await StructureController.createNode({ projectId, type: "SCENE", title: "S1", parentId: ch.id });
    await StructureController.updateNode(s1.id, { status: "FINAL" });

    const prog = await ProgressController.getProjectProgress(projectId);
    expect(prog.parts).toHaveLength(1);
    expect(prog.parts[0].title).toBe("Part 1");
    expect(prog.parts[0].totalScenes).toBe(1);
    expect(prog.parts[0].finalScenes).toBe(1);
  });
});

describe("Sessions API routes", () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await ProjectsController.createProject({ title: "API Test" });
    projectId = project.id;
  });

  it("POST /api/projects/[id]/sessions creates a session", async () => {
    const { POST } = await import("@/app/api/projects/[id]/sessions/route");
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordsWritten: 200, durationSeconds: 600, date: "2026-03-29" }),
    });
    const res = await POST(req, mockParams({ id: projectId }));
    expect((res as any).status).toBe(201);
    const body = await (res as any).json();
    expect(body.projectId).toBe(projectId);
    expect(body.wordsWritten).toBe(200);
  });

  it("GET /api/projects/[id]/progress returns progress", async () => {
    const { GET } = await import("@/app/api/projects/[id]/progress/route");
    const req = new Request("http://localhost");
    const res = await GET(req, mockParams({ id: projectId }));
    expect((res as any).status || 200).toBe(200);
    const body = await (res as any).json();
    expect(body.totalScenes).toBe(0);
    expect(body.parts).toEqual([]);
  });

  it("GET /api/sessions/heatmap returns 28 days", async () => {
    const { GET } = await import("@/app/api/sessions/heatmap/route");
    const res = await GET();
    expect((res as any).status || 200).toBe(200);
    const body = await (res as any).json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(28);
  });
});
