import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => "user-1"),
  verifyUniverseAccess: vi.fn(),
  verifyProjectAccess: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/controllers/universes", () => ({
  UniversesController: {
    linkProjectToUniverse: vi.fn(async () => undefined),
    unlinkProjectFromUniverse: vi.fn(async () => undefined),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { prisma } from "@/lib/db";
import { verifyUniverseAccess, verifyProjectAccess } from "@/lib/api-auth";
import { UniversesController } from "@/lib/controllers/universes";
import { POST } from "@/app/api/universes/[id]/projects/route";
import { DELETE } from "@/app/api/universes/[id]/projects/[projectId]/route";

function forbidden() {
  return {
    authorized: false as const,
    response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  };
}

function makePost(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/universes/u-1/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDelete(): NextRequest {
  return new NextRequest("http://localhost/api/universes/u-1/projects/p-1", {
    method: "DELETE",
  });
}

const postParams = { params: Promise.resolve({ id: "u-1" }) };
const deleteParams = { params: Promise.resolve({ id: "u-1", projectId: "p-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyUniverseAccess).mockResolvedValue({
    authorized: true,
    universe: { id: "u-1", userId: "user-1" },
  });
  vi.mocked(verifyProjectAccess).mockResolvedValue({
    authorized: true,
    project: { id: "p-1", userId: "user-1" },
    role: "OWNER",
  });
});

describe("POST /api/universes/[id]/projects", () => {
  it("links the project when the caller owns both", async () => {
    const res = await POST(makePost({ projectId: "p-1" }), postParams);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ projectId: "p-1", universeId: "u-1" });
    expect(UniversesController.linkProjectToUniverse).toHaveBeenCalledWith("p-1", "u-1");
  });

  it("refuses when the caller cannot access the universe", async () => {
    vi.mocked(verifyUniverseAccess).mockResolvedValue(forbidden());

    const res = await POST(makePost({ projectId: "p-1" }), postParams);

    expect(res.status).toBe(403);
    expect(UniversesController.linkProjectToUniverse).not.toHaveBeenCalled();
  });

  it("refuses when the caller cannot access the project", async () => {
    vi.mocked(verifyProjectAccess).mockResolvedValue(forbidden());

    const res = await POST(makePost({ projectId: "p-1" }), postParams);

    expect(res.status).toBe(403);
    expect(UniversesController.linkProjectToUniverse).not.toHaveBeenCalled();
  });

  it("returns 400 when projectId is missing", async () => {
    const res = await POST(makePost({}), postParams);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("projectId is required");
    expect(UniversesController.linkProjectToUniverse).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/universes/[id]/projects/[projectId]", () => {
  it("unlinks a project linked to this universe", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ universeId: "u-1" } as never);

    const res = await DELETE(makeDelete(), deleteParams);

    expect(res.status).toBe(200);
    expect(UniversesController.unlinkProjectFromUniverse).toHaveBeenCalledWith("p-1");
  });

  it("returns 404 when the project is linked to a different universe", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ universeId: "u-other" } as never);

    const res = await DELETE(makeDelete(), deleteParams);

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Project is not linked to this universe");
    expect(UniversesController.unlinkProjectFromUniverse).not.toHaveBeenCalled();
  });

  it("refuses when the caller cannot access the universe", async () => {
    vi.mocked(verifyUniverseAccess).mockResolvedValue(forbidden());
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ universeId: "u-1" } as never);

    const res = await DELETE(makeDelete(), deleteParams);

    expect(res.status).toBe(403);
    expect(UniversesController.unlinkProjectFromUniverse).not.toHaveBeenCalled();
  });

  it("refuses when the caller cannot access the project", async () => {
    vi.mocked(verifyProjectAccess).mockResolvedValue(forbidden());

    const res = await DELETE(makeDelete(), deleteParams);

    expect(res.status).toBe(403);
    expect(UniversesController.unlinkProjectFromUniverse).not.toHaveBeenCalled();
  });
});
