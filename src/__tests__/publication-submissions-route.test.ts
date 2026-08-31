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
    publicationSubmission: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    project: { findUnique: vi.fn() },
  },
}));

import { GET, POST } from "@/app/api/projects/[id]/submissions/publications/route";
import { PATCH, DELETE } from "@/app/api/projects/[id]/submissions/publications/[submissionId]/route";
import { prisma } from "@/lib/db";

const now = new Date("2026-08-01T00:00:00Z");

function makeSubmission(overrides = {}) {
  return {
    id: "pub-1",
    projectId: "proj-1",
    venueName: "The New Yorker",
    submissionDate: now,
    status: "submitted",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeParams(id: string = "proj-1") {
  return { params: Promise.resolve({ id }) };
}

function makeSubmissionParams(id: string = "proj-1", submissionId: string = "pub-1") {
  return { params: Promise.resolve({ id, submissionId }) };
}

describe("GET /api/projects/:id/submissions/publications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when project not found", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/projects/proj-missing/submissions/publications");
    const res = await GET(req, makeParams("proj-missing"));
    expect(res.status).toBe(404);
  });

  it("returns submissions list", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: "proj-1" } as any);
    vi.mocked(prisma.publicationSubmission.findMany).mockResolvedValue([makeSubmission()]);
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/publications");
    const res = await GET(req, makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.submissions).toHaveLength(1);
    expect(body.submissions[0].venueName).toBe("The New Yorker");
  });
});

describe("POST /api/projects/:id/submissions/publications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 for invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/publications", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(400);
  });

  it("returns 404 when project not found", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/projects/proj-missing/submissions/publications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        venueName: "Test Venue",
        submissionDate: "2026-08-01T00:00:00Z",
      }),
    });
    const res = await POST(req, makeParams("proj-missing"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Project not found");
  });

  it("creates submission successfully", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: "proj-1" } as any);
    vi.mocked(prisma.publicationSubmission.create).mockResolvedValue(makeSubmission());
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/publications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        venueName: "The New Yorker",
        submissionDate: "2026-08-01T00:00:00Z",
      }),
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/projects/:id/submissions/publications/:submissionId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when submission belongs to different project", async () => {
    vi.mocked(prisma.publicationSubmission.findUnique).mockResolvedValue({
      id: "pub-1",
      projectId: "proj-OTHER",
    } as any);
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/publications/pub-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venueName: "Updated" }),
    });
    const res = await PATCH(req, makeSubmissionParams());
    expect(res.status).toBe(404);
  });

  it("updates submission successfully", async () => {
    vi.mocked(prisma.publicationSubmission.findUnique)
      .mockResolvedValueOnce({ id: "pub-1", projectId: "proj-1" } as any)  // resolve
      .mockResolvedValueOnce({ id: "pub-1" } as any);                       // controller
    vi.mocked(prisma.publicationSubmission.update).mockResolvedValue(
      makeSubmission({ venueName: "Updated" })
    );
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/publications/pub-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venueName: "Updated" }),
    });
    const res = await PATCH(req, makeSubmissionParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.venueName).toBe("Updated");
  });
});

describe("DELETE /api/projects/:id/submissions/publications/:submissionId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when submission not found", async () => {
    vi.mocked(prisma.publicationSubmission.findUnique).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/publications/pub-missing", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeSubmissionParams("proj-1", "pub-missing"));
    expect(res.status).toBe(404);
  });

  it("deletes submission successfully", async () => {
    vi.mocked(prisma.publicationSubmission.findUnique)
      .mockResolvedValueOnce({ id: "pub-1", projectId: "proj-1" } as any)
      .mockResolvedValueOnce({ id: "pub-1" } as any);
    vi.mocked(prisma.publicationSubmission.delete).mockResolvedValue(makeSubmission());
    const req = new NextRequest("http://localhost/api/projects/proj-1/submissions/publications/pub-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, makeSubmissionParams());
    expect(res.status).toBe(200);
  });
});
