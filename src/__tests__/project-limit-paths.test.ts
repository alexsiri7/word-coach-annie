import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { NextRequest } from "next/server";

// Every project-creation path other than POST /api/projects (covered in
// projects-limit-route.test.ts) must enforce UserAiSettings.maxActiveProjects.

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => null),
}));

vi.mock("@/lib/auth", () => ({
  isGoogleAuthMode: vi.fn(() => false),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { getCurrentUserId } from "@/lib/api-auth";
import { createProject } from "@/mcp/tools/projects";
import { getAdkToolByName } from "@/lib/ai/adk-tools";

const LIMIT_MESSAGE = "You've reached your 3 active project limit. Archive a project to create a new one.";

const exportPayload = {
  exportVersion: 1,
  project: { title: "Imported", author: "", synopsis: "", genre: "", projectType: "FICTION" },
  structureNodes: [],
  contentVersions: [],
  storyObjects: [],
  annotations: [],
  relationships: [],
};

async function userAtLimit() {
  const user = await testPrisma.user.create({
    data: { email: "at-limit@test.com", googleId: "g-at-limit" },
  });
  await testPrisma.project.createMany({
    data: [
      { title: "P1", userId: user.id },
      { title: "P2", userId: user.id },
      { title: "P3", userId: user.id },
    ],
  });
  vi.mocked(getCurrentUserId).mockReturnValue(user.id);
  return user;
}

function projectCount(userId: string) {
  return testPrisma.project.count({ where: { userId } });
}

function post(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("active project limit on non-REST creation paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST /api/projects/import returns 403 with the limit message and creates no project", async () => {
    const user = await userAtLimit();
    const { POST } = await import("@/app/api/projects/import/route");

    const res = await POST(post("http://localhost/api/projects/import", exportPayload));

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(LIMIT_MESSAGE);
    expect(await projectCount(user.id)).toBe(3);
  });

  it("POST /api/projects/import succeeds below the limit", async () => {
    const user = await userAtLimit();
    await testPrisma.project.updateMany({ where: { userId: user.id, title: "P3" }, data: { archivedAt: new Date() } });
    const { POST } = await import("@/app/api/projects/import/route");

    const res = await POST(post("http://localhost/api/projects/import", exportPayload));

    expect(res.status).toBe(201);
    expect(await projectCount(user.id)).toBe(4);
  });

  it("MCP create_project rejects at the limit and creates no project", async () => {
    const user = await userAtLimit();

    await expect(createProject({ title: "P4", userId: user.id })).rejects.toThrow(LIMIT_MESSAGE);
    expect(await projectCount(user.id)).toBe(3);
  });

  it("chat-agent create_project rejects at the limit and creates no project", async () => {
    const user = await userAtLimit();
    const tool = getAdkToolByName(
      { userId: user.id, userEmail: user.email, projectId: "any", role: "OWNER" },
      "create_project"
    )!;

    await expect(
      tool.runAsync({ args: { title: "P4" }, toolContext: undefined as never })
    ).rejects.toThrow(LIMIT_MESSAGE);
    expect(await projectCount(user.id)).toBe(3);
  });

  it("onboarding sample is exempt from the limit", async () => {
    const user = await userAtLimit();
    const { POST } = await import("@/app/api/onboarding/sample/route");

    const res = await POST(post("http://localhost/api/onboarding/sample", {}));

    expect(res.status).toBe(201);
    expect(await testPrisma.project.count({ where: { userId: user.id, isSample: true } })).toBe(1);
  });
});
