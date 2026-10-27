import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-auth")>()),
  getCurrentUserId: vi.fn(() => null),
  verifyProjectWriteAccess: vi.fn(async () => ({ authorized: true })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { POST } from "@/app/api/projects/[id]/sessions/route";
import { MAX_SESSION_WORDS } from "@/schemas/sessions";

function post(projectId: string, body: unknown) {
  const req = new NextRequest(`http://localhost/api/projects/${projectId}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ id: projectId }) });
}

describe("POST /api/projects/[id]/sessions", () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await testPrisma.project.create({ data: { title: "Sessions", author: "Tester" } });
    projectId = project.id;
  });

  it("creates a session from the body the editor sends", async () => {
    const node = await testPrisma.structureNode.create({
      data: { projectId, type: "SCENE", title: "Scene", orderIndex: 0 },
    });
    const res = await post(projectId, {
      nodeId: node.id,
      startedAt: "2026-03-15T10:00:00.000Z",
      endedAt: "2026-03-15T10:30:00.000Z",
      wordsWritten: 500,
      durationSeconds: 1800,
      date: "2026-03-15",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ nodeId: node.id, wordsWritten: 500, durationSeconds: 1800, date: "2026-03-15" });
  });

  it.each([
    ["a negative wordsWritten", { wordsWritten: -100 }],
    ["an overflowing wordsWritten", { wordsWritten: MAX_SESSION_WORDS + 1 }],
    ["a fractional wordsWritten", { wordsWritten: 1.5 }],
    ["a string wordsWritten", { wordsWritten: "500" }],
    ["a negative durationSeconds", { durationSeconds: -1 }],
    ["a non-ISO date", { date: "15/03/2026" }],
    ["a non-ISO startedAt", { startedAt: "yesterday" }],
  ])("returns 400 for %s and stores nothing", async (_label, body) => {
    const res = await post(projectId, body);
    expect(res.status).toBe(400);
    expect(await testPrisma.writingSession.count()).toBe(0);
  });

  it("returns 404 for a nodeId from another project", async () => {
    const other = await testPrisma.project.create({ data: { title: "Other", author: "Someone" } });
    const foreign = await testPrisma.structureNode.create({
      data: { projectId: other.id, type: "SCENE", title: "Foreign", orderIndex: 0 },
    });
    const res = await post(projectId, { nodeId: foreign.id, wordsWritten: 10 });
    expect(res.status).toBe(404);
    expect(await testPrisma.writingSession.count()).toBe(0);
  });
});
