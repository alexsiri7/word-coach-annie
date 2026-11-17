import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-auth")>()),
  getCurrentUserId: vi.fn(() => null),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { POST } from "@/app/api/projects/[id]/sessions/route";
import { getCurrentUserId } from "@/lib/api-auth";
import { MAX_SESSION_WORDS } from "@/schemas/sessions";

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

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

  it("creates a session from the body the scene editor sends", async () => {
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
    ["a future date", { date: tomorrow.toISOString().slice(0, 10) }],
    ["a future startedAt", { startedAt: tomorrow.toISOString() }],
    ["a future endedAt", { endedAt: tomorrow.toISOString() }],
  ])("returns 400 for %s and stores nothing", async (_label, body) => {
    const res = await post(projectId, body);
    expect(res.status).toBe(400);
    expect(await testPrisma.writingSession.count()).toBe(0);
  });

  it.each([
    ["dated today", { date: new Date().toISOString().slice(0, 10) }],
    ["ended by a client clock a few seconds fast", { endedAt: new Date(Date.now() + 5000).toISOString() }],
  ])("creates a session %s", async (_label, body) => {
    const res = await post(projectId, body);
    expect(res.status).toBe(201);
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

  it("returns 403 for an editor of the project and stores nothing", async () => {
    const owner = await testPrisma.user.create({ data: { email: "owner@example.com", googleId: "g-owner" } });
    const editor = await testPrisma.user.create({ data: { email: "editor@example.com", googleId: "g-editor" } });
    await testPrisma.project.update({ where: { id: projectId }, data: { userId: owner.id } });
    await testPrisma.projectShare.create({ data: { projectId, email: editor.email, role: "EDITOR" } });
    vi.mocked(getCurrentUserId).mockReturnValueOnce(editor.id);

    const res = await post(projectId, { wordsWritten: 10 });
    expect(res.status).toBe(403);
    expect(await testPrisma.writingSession.count()).toBe(0);
  });

  it("creates a session for the project owner", async () => {
    const owner = await testPrisma.user.create({ data: { email: "owner@example.com", googleId: "g-owner" } });
    await testPrisma.project.update({ where: { id: projectId }, data: { userId: owner.id } });
    vi.mocked(getCurrentUserId).mockReturnValueOnce(owner.id);

    const res = await post(projectId, { wordsWritten: 10 });
    expect(res.status).toBe(201);
  });
});
