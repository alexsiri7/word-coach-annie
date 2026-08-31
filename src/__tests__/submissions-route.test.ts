import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { NextRequest, NextResponse } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => null),
  verifyProjectReadAccess: vi.fn(async () => ({ authorized: true })),
  verifyProjectWriteAccess: vi.fn(async () => ({ authorized: true })),
}));

import { verifyProjectReadAccess } from "@/lib/api-auth";

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Submissions API Routes", () => {
  let projectId: string;
  let providerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const project = await testPrisma.project.create({
      data: { title: "Test Project", author: "Author" },
    });
    projectId = project.id;

    const provider = await testPrisma.provider.create({
      data: { name: "Acme Literary" },
    });
    providerId = provider.id;
  });

  describe("GET /api/projects/[id]/submissions/contests", () => {
    it("returns empty list when no contest submissions exist", async () => {
      const { GET } = await import(
        "@/app/api/projects/[id]/submissions/contests/route"
      );
      const req = makeGetRequest(
        `/api/projects/${projectId}/submissions/contests`
      );
      const res = await GET(req, { params: Promise.resolve({ id: projectId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.submissions).toEqual([]);
      expect(data.total).toBe(0);
    });

    it("returns contest submissions for the project", async () => {
      await testPrisma.contestSubmission.create({
        data: {
          projectId,
          providerId,
          contestName: "Bridport Prize",
          submissionDate: new Date("2026-01-01"),
          status: "submitted",
        },
      });

      const { GET } = await import(
        "@/app/api/projects/[id]/submissions/contests/route"
      );
      const req = makeGetRequest(
        `/api/projects/${projectId}/submissions/contests`
      );
      const res = await GET(req, { params: Promise.resolve({ id: projectId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.submissions).toHaveLength(1);
      expect(data.submissions[0].contestName).toBe("Bridport Prize");
      expect(data.total).toBe(1);
    });

    it("returns 500 for non-existent project", async () => {
      const { GET } = await import(
        "@/app/api/projects/[id]/submissions/contests/route"
      );
      const req = makeGetRequest(
        "/api/projects/does-not-exist/submissions/contests"
      );
      const res = await GET(req, {
        params: Promise.resolve({ id: "does-not-exist" }),
      });
      expect(res.status).toBe(500);
    });

    it("returns 403 when user lacks read access", async () => {
      vi.mocked(verifyProjectReadAccess).mockResolvedValueOnce({
        authorized: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      });

      const { GET } = await import(
        "@/app/api/projects/[id]/submissions/contests/route"
      );
      const req = makeGetRequest(
        `/api/projects/${projectId}/submissions/contests`
      );
      const res = await GET(req, { params: Promise.resolve({ id: projectId }) });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/projects/[id]/submissions/publications", () => {
    it("returns empty list when no publication submissions exist", async () => {
      const { GET } = await import(
        "@/app/api/projects/[id]/submissions/publications/route"
      );
      const req = makeGetRequest(
        `/api/projects/${projectId}/submissions/publications`
      );
      const res = await GET(req, { params: Promise.resolve({ id: projectId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.submissions).toEqual([]);
      expect(data.total).toBe(0);
    });

    it("returns publication submissions for the project", async () => {
      await testPrisma.publicationSubmission.create({
        data: {
          projectId,
          venueName: "The New Yorker",
          submissionDate: new Date("2026-02-01"),
          status: "submitted",
        },
      });

      const { GET } = await import(
        "@/app/api/projects/[id]/submissions/publications/route"
      );
      const req = makeGetRequest(
        `/api/projects/${projectId}/submissions/publications`
      );
      const res = await GET(req, { params: Promise.resolve({ id: projectId }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.submissions).toHaveLength(1);
      expect(data.submissions[0].venueName).toBe("The New Yorker");
      expect(data.total).toBe(1);
    });

    it("returns 500 for non-existent project", async () => {
      const { GET } = await import(
        "@/app/api/projects/[id]/submissions/publications/route"
      );
      const req = makeGetRequest(
        "/api/projects/does-not-exist/submissions/publications"
      );
      const res = await GET(req, {
        params: Promise.resolve({ id: "does-not-exist" }),
      });
      expect(res.status).toBe(500);
    });

    it("returns 403 when user lacks read access", async () => {
      vi.mocked(verifyProjectReadAccess).mockResolvedValueOnce({
        authorized: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      });

      const { GET } = await import(
        "@/app/api/projects/[id]/submissions/publications/route"
      );
      const req = makeGetRequest(
        `/api/projects/${projectId}/submissions/publications`
      );
      const res = await GET(req, { params: Promise.resolve({ id: projectId }) });
      expect(res.status).toBe(403);
    });
  });
});
