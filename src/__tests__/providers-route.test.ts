import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-auth")>()),
  getCurrentUserId: vi.fn(() => "owner"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { PATCH, DELETE } from "@/app/api/providers/[id]/route";

function request(method: string, id: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/providers/${id}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("/api/providers/[id]", () => {
  let providerId: string;

  beforeEach(async () => {
    await testPrisma.user.create({ data: { id: "owner", email: "owner@test.com", googleId: "g-owner" } });
    providerId = (
      await testPrisma.provider.create({
        data: { name: "Old", website: "https://old.example", notes: "n", userId: "owner" },
      })
    ).id;
  });

  it("clears the website when PATCHed with null", async () => {
    const res = await PATCH(request("PATCH", providerId, { name: "New", website: null }), {
      params: Promise.resolve({ id: providerId }),
    });
    expect(res.status).toBe(200);
    const stored = await testPrisma.provider.findUniqueOrThrow({ where: { id: providerId } });
    expect(stored).toMatchObject({ name: "New", website: "", notes: "n" });
  });

  it("refuses with 409 to delete a provider a submission still cites", async () => {
    const project = await testPrisma.project.create({ data: { title: "Story", author: "A", userId: "owner" } });
    await testPrisma.contestSubmission.create({
      data: { projectId: project.id, providerId, contestName: "Prize", submissionDate: new Date() },
    });
    const res = await DELETE(request("DELETE", providerId), { params: Promise.resolve({ id: providerId }) });
    expect(res.status).toBe(409);
    expect(await testPrisma.provider.findUnique({ where: { id: providerId } })).not.toBeNull();
  });
});
