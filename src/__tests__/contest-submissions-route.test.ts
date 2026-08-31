import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn().mockReturnValue("user-1"),
  verifyProjectWriteAccess: vi.fn().mockResolvedValue({ authorized: true }),
  verifyProjectReadAccess: vi.fn().mockResolvedValue({ authorized: true }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/sanitize-server", () => ({
  sanitizeInput: vi.fn((s: string) => s),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    contestSubmission: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    project: { findUnique: vi.fn() },
    provider: { findUnique: vi.fn() },
  },
}));

import { GET, POST } from "@/app/api/projects/[id]/submissions/contests/route";
import { PATCH, DELETE } from "@/app/api/projects/[id]/submissions/contests/[submissionId]/route";
import { verifyProjectReadAccess } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

const now = new Date("2026-08-01T00:00:00Z");

function makeSubmission(overrides = {}) {
  return {
    id: "sub-1",
    projectId: "proj-1",
    providerId: "prov-1",
    contestName: "Test Contest",
    submissionDate: now,
    reviewDate: null,
    submissionUrl: "",
    status: "submitted",
    createdAt: now,
    updatedAt: now,
    provider: { id: "prov-1", name: "Test Provider" },
    ...overrides,
  };
}

function makeParams(id: string = "proj-1") {
  return { params: Promise.resolve({ id }) };
}

function makeSubmissionParams(id: string = "proj-1", submissionId: string = "sub-1") {
  return { params: Promise.resolve({ id, submissionId }) };
}

describe("GET /api/projects/:id/submissions/contests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when project not found", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/projects/proj-missing/submissions/contests");
    const res = await GET(req, makeParams("proj-missing"));
    expect(res.status).toBe(404);
  });

  it("returns submissions list", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: "proj-1" } as any);
    vi.mocked(prisma.contestSubmission.findMany).mockResolvedValue([makeSubmission()]);
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/contests");
    const res = await GET(req, makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.submissions).toHaveLength(1);
    expect(body.submissions[0].contestName).toBe("Test Contest");
  });

  it("returns 401 when unauthorized", async () => {
    vi.mocked(verifyProjectReadAccess).mockResolvedValue({
      authorized: false,
      response: new (await import("next/server")).NextResponse(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401 }
      ),
    });
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/contests");
    const res = await GET(req, makeParams());
    expect(res.status).toBe(401);
  });
});

describe("POST /api/projects/:id/submissions/contests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/contests", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing required fields", async () => {
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/contests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(400);
  });

  it("returns 404 when provider not found", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: "proj-1" } as any);
    vi.mocked(prisma.provider.findUnique).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/contests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId: "prov-missing",
        contestName: "Test Contest",
        submissionDate: "2026-08-01T00:00:00Z",
      }),
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Provider not found");
  });

  it("creates submission successfully", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: "proj-1" } as any);
    vi.mocked(prisma.provider.findUnique).mockResolvedValue({ id: "prov-1" } as any);
    vi.mocked(prisma.contestSubmission.create).mockResolvedValue(makeSubmission());
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/contests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId: "prov-1",
        contestName: "Test Contest",
        submissionDate: "2026-08-01T00:00:00Z",
      }),
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/projects/:id/submissions/contests/:submissionId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when submission belongs to different project", async () => {
    vi.mocked(prisma.contestSubmission.findUnique).mockResolvedValue({
      id: "sub-1",
      projectId: "proj-OTHER",
    } as any);
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/contests/sub-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contestName: "Updated" }),
    });
    const res = await PATCH(req, makeSubmissionParams());
    expect(res.status).toBe(404);
  });

  it("returns 400 for empty update body", async () => {
    vi.mocked(prisma.contestSubmission.findUnique).mockResolvedValue({
      id: "sub-1",
      projectId: "proj-1",
    } as any);
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/contests/sub-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, makeSubmissionParams());
    expect(res.status).toBe(400);
  });

  it("updates submission successfully", async () => {
    vi.mocked(prisma.contestSubmission.findUnique)
      .mockResolvedValueOnce({ id: "sub-1", projectId: "proj-1" } as any)    // resolveContestSubmission
      .mockResolvedValueOnce({ id: "sub-1" } as any);                        // controller check
    vi.mocked(prisma.contestSubmission.update).mockResolvedValue(
      makeSubmission({ contestName: "Updated" })
    );
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/contests/sub-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contestName: "Updated" }),
    });
    const res = await PATCH(req, makeSubmissionParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.contestName).toBe("Updated");
  });
});

describe("DELETE /api/projects/:id/submissions/contests/:submissionId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when submission not found", async () => {
    vi.mocked(prisma.contestSubmission.findUnique).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/contests/sub-missing", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeSubmissionParams("proj-1", "sub-missing"));
    expect(res.status).toBe(404);
  });

  it("deletes submission successfully", async () => {
    vi.mocked(prisma.contestSubmission.findUnique)
      .mockResolvedValueOnce({ id: "sub-1", projectId: "proj-1" } as any)    // resolveContestSubmission
      .mockResolvedValueOnce({ id: "sub-1" } as any);                        // controller check
    vi.mocked(prisma.contestSubmission.delete).mockResolvedValue(makeSubmission());
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/contests/sub-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeSubmissionParams());
    expect(res.status).toBe(200);
  });
});
