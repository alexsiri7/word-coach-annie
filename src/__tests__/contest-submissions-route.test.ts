import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-auth")>()),
  getCurrentUserId: vi.fn(() => "attacker"),
  verifyProjectWriteAccess: vi.fn(async () => ({ authorized: true })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getCurrentUserId } from "@/lib/api-auth";
import { POST } from "@/app/api/projects/[id]/submissions/contests/route";
import { PATCH } from "@/app/api/projects/[id]/submissions/contests/[submissionId]/route";
import { DELETE as deleteProvider } from "@/app/api/providers/[id]/route";

function jsonRequest(method: string, url: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("Contest submission provider ownership", () => {
  let projectId: string;
  let ownProviderId: string;
  let victimProviderId: string;

  beforeEach(async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("attacker");
    await testPrisma.user.createMany({
      data: [
        { id: "attacker", email: "attacker@test.com", googleId: "g-attacker" },
        { id: "victim", email: "victim@test.com", googleId: "g-victim" },
        { id: "editor", email: "editor@test.com", googleId: "g-editor" },
      ],
    });
    const project = await testPrisma.project.create({
      data: { title: "Attacker's story", author: "A", userId: "attacker" },
    });
    projectId = project.id;
    ownProviderId = (await testPrisma.provider.create({ data: { name: "Mine", userId: "attacker" } })).id;
    victimProviderId = (await testPrisma.provider.create({ data: { name: "Theirs", userId: "victim" } })).id;
  });

  function create(providerId: string) {
    return POST(
      jsonRequest("POST", `/api/projects/${projectId}/submissions/contests`, {
        providerId,
        contestName: "Spring Contest",
        submissionDate: "2026-03-01T00:00:00.000Z",
      }),
      { params: Promise.resolve({ id: projectId }) }
    );
  }

  it("rejects creating a submission against another user's provider, leaving it deletable", async () => {
    const res = await create(victimProviderId);
    expect(res.status).toBe(403);
    expect(await testPrisma.contestSubmission.count()).toBe(0);

    vi.mocked(getCurrentUserId).mockReturnValue("victim");
    const del = await deleteProvider(jsonRequest("DELETE", `/api/providers/${victimProviderId}`), {
      params: Promise.resolve({ id: victimProviderId }),
    });
    expect(del.status).toBe(200);
    expect(await testPrisma.provider.findUnique({ where: { id: victimProviderId } })).toBeNull();
  });

  it("rejects moving a submission onto another user's provider", async () => {
    const created = await create(ownProviderId);
    expect(created.status).toBe(201);
    const { id: submissionId } = await created.json();

    const res = await PATCH(
      jsonRequest("PATCH", `/api/projects/${projectId}/submissions/contests/${submissionId}`, {
        providerId: victimProviderId,
      }),
      { params: Promise.resolve({ id: projectId, submissionId }) }
    );
    expect(res.status).toBe(403);
    const row = await testPrisma.contestSubmission.findUnique({ where: { id: submissionId } });
    expect(row?.providerId).toBe(ownProviderId);
  });

  it("returns 404 for a provider that does not exist", async () => {
    const res = await create("no-such-provider");
    expect(res.status).toBe(404);
  });

  it("lets an editor of the project cite their own provider, but still not a third user's", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("editor");
    const editorProviderId = (await testPrisma.provider.create({ data: { name: "Editor's", userId: "editor" } })).id;

    const created = await create(editorProviderId);
    expect(created.status).toBe(201);
    const { id: submissionId } = await created.json();

    const patch = (providerId: string) =>
      PATCH(
        jsonRequest("PATCH", `/api/projects/${projectId}/submissions/contests/${submissionId}`, { providerId }),
        { params: Promise.resolve({ id: projectId, submissionId }) }
      );
    expect((await patch(ownProviderId)).status).toBe(200);
    expect((await patch(editorProviderId)).status).toBe(200);
    expect((await patch(victimProviderId)).status).toBe(403);
    expect((await create(victimProviderId)).status).toBe(403);
  });
});
