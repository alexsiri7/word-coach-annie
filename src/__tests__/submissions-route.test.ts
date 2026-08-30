import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { NextRequest, NextResponse } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => null),
  verifyProjectReadAccess: vi.fn(async () => ({ authorized: true })),
  verifyProjectWriteAccess: vi.fn(async () => ({ authorized: true })),
}));

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

function makePostRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makePatchRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeDeleteRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method: "DELETE" });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Providers API", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Create a user with id "local" since getCurrentUserId returns null in dev mode
    // and the controller falls back to "local" as userId
    await testPrisma.user.create({
      data: { id: "local", email: "local@test.com", googleId: "google-local", name: "Local User" },
    });
  });

  describe("POST /api/submissions/providers", () => {
    it("creates provider successfully and returns 201", async () => {
      const { POST } = await import("@/app/api/submissions/providers/route");
      const res = await POST(
        makePostRequest("/api/submissions/providers", {
          name: "Clarkesworld",
          website: "https://clarkesworldmagazine.com",
        })
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("Clarkesworld");
      expect(body.website).toBe("https://clarkesworldmagazine.com");
    });

    it("returns 400 when name is missing", async () => {
      const { POST } = await import("@/app/api/submissions/providers/route");
      const res = await POST(
        makePostRequest("/api/submissions/providers", {})
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when website is invalid URL", async () => {
      const { POST } = await import("@/app/api/submissions/providers/route");
      const res = await POST(
        makePostRequest("/api/submissions/providers", {
          name: "Test",
          website: "not-a-url",
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/submissions/providers", () => {
    it("returns provider list", async () => {
      await testPrisma.provider.create({
        data: { userId: "local", name: "Provider A" },
      });
      await testPrisma.provider.create({
        data: { userId: "local", name: "Provider B" },
      });

      const { GET } = await import("@/app/api/submissions/providers/route");
      const res = await GET(makeGetRequest("/api/submissions/providers"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.providers).toHaveLength(2);
      expect(body.total).toBe(2);
    });
  });

  describe("PATCH /api/submissions/providers/[id]", () => {
    it("updates provider name", async () => {
      const provider = await testPrisma.provider.create({
        data: { userId: "local", name: "Old Name" },
      });

      const { PATCH } = await import("@/app/api/submissions/providers/[id]/route");
      const res = await PATCH(
        makePatchRequest(`/api/submissions/providers/${provider.id}`, { name: "New Name" }),
        { params: Promise.resolve({ id: provider.id }) }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("New Name");
    });

    it("returns 404 for non-existent provider", async () => {
      const { PATCH } = await import("@/app/api/submissions/providers/[id]/route");
      const res = await PATCH(
        makePatchRequest("/api/submissions/providers/nonexistent", { name: "x" }),
        { params: Promise.resolve({ id: "nonexistent" }) }
      );
      expect(res.status).toBe(404);
    });

    it("returns 400 for empty update body", async () => {
      const provider = await testPrisma.provider.create({
        data: { userId: "local", name: "Test" },
      });

      const { PATCH } = await import("@/app/api/submissions/providers/[id]/route");
      const res = await PATCH(
        makePatchRequest(`/api/submissions/providers/${provider.id}`, {}),
        { params: Promise.resolve({ id: provider.id }) }
      );
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/submissions/providers/[id]", () => {
    it("deletes provider and returns { success: true }", async () => {
      const provider = await testPrisma.provider.create({
        data: { userId: "local", name: "To delete" },
      });

      const { DELETE } = await import("@/app/api/submissions/providers/[id]/route");
      const res = await DELETE(
        makeDeleteRequest(`/api/submissions/providers/${provider.id}`),
        { params: Promise.resolve({ id: provider.id }) }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      const gone = await testPrisma.provider.findUnique({ where: { id: provider.id } });
      expect(gone).toBeNull();
    });

    it("returns 404 for non-existent provider", async () => {
      const { DELETE } = await import("@/app/api/submissions/providers/[id]/route");
      const res = await DELETE(
        makeDeleteRequest("/api/submissions/providers/nonexistent"),
        { params: Promise.resolve({ id: "nonexistent" }) }
      );
      expect(res.status).toBe(404);
    });

    it("returns 409 when provider has linked contest submissions", async () => {
      const user = await testPrisma.user.create({
        data: { email: "conflict@test.com", googleId: "google-conflict", name: "Conflict User" },
      });
      const project = await testPrisma.project.create({
        data: { title: "Test Project", author: "Author", userId: user.id },
      });
      const provider = await testPrisma.provider.create({
        data: { userId: "local", name: "Provider With Submissions" },
      });
      await testPrisma.contestSubmission.create({
        data: {
          projectId: project.id,
          providerId: provider.id,
          contestName: "Linked Contest",
          submissionDate: new Date("2026-03-01"),
        },
      });

      const { DELETE } = await import("@/app/api/submissions/providers/[id]/route");
      const res = await DELETE(
        makeDeleteRequest(`/api/submissions/providers/${provider.id}`),
        { params: Promise.resolve({ id: provider.id }) }
      );
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toMatch(/contest submission/i);
    });
  });

  describe("Provider ownership check", () => {
    it("returns 403 when user does not own the provider (PATCH)", async () => {
      const { getCurrentUserId } = await import("@/lib/api-auth");
      const provider = await testPrisma.provider.create({
        data: { userId: "local", name: "My Provider" },
      });

      vi.mocked(getCurrentUserId).mockReturnValueOnce("other-user");

      const { PATCH } = await import("@/app/api/submissions/providers/[id]/route");
      const res = await PATCH(
        makePatchRequest(`/api/submissions/providers/${provider.id}`, { name: "Hijacked" }),
        { params: Promise.resolve({ id: provider.id }) }
      );
      expect(res.status).toBe(403);
    });

    it("returns 403 when user does not own the provider (DELETE)", async () => {
      const { getCurrentUserId } = await import("@/lib/api-auth");
      const provider = await testPrisma.provider.create({
        data: { userId: "local", name: "My Provider" },
      });

      vi.mocked(getCurrentUserId).mockReturnValueOnce("other-user");

      const { DELETE } = await import("@/app/api/submissions/providers/[id]/route");
      const res = await DELETE(
        makeDeleteRequest(`/api/submissions/providers/${provider.id}`),
        { params: Promise.resolve({ id: provider.id }) }
      );
      expect(res.status).toBe(403);
    });
  });
});

describe("Publication Submissions API", () => {
  let projectId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const project = await testPrisma.project.create({
      data: { title: "Test Project", author: "Author" },
    });
    projectId = project.id;
  });

  describe("POST /api/submissions/publications", () => {
    it("creates submission successfully and returns 201", async () => {
      const { POST } = await import("@/app/api/submissions/publications/route");
      const res = await POST(
        makePostRequest("/api/submissions/publications", {
          projectId,
          venueName: "The New Yorker",
          submissionDate: "2026-01-15T00:00:00.000Z",
        })
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.venueName).toBe("The New Yorker");
      expect(body.status).toBe("submitted");
    });

    it("returns 400 when projectId is missing", async () => {
      const { POST } = await import("@/app/api/submissions/publications/route");
      const res = await POST(
        makePostRequest("/api/submissions/publications", {
          venueName: "Test",
          submissionDate: "2026-01-15T00:00:00.000Z",
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when submissionDate is not ISO 8601", async () => {
      const { POST } = await import("@/app/api/submissions/publications/route");
      const res = await POST(
        makePostRequest("/api/submissions/publications", {
          projectId,
          venueName: "Test",
          submissionDate: "January 15",
        })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/submissions/publications", () => {
    it("returns submission list for project", async () => {
      await testPrisma.publicationSubmission.create({
        data: {
          projectId,
          venueName: "Venue A",
          submissionDate: new Date("2026-01-15"),
        },
      });

      const { GET } = await import("@/app/api/submissions/publications/route");
      const res = await GET(makeGetRequest(`/api/submissions/publications?projectId=${projectId}`));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.submissions).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it("returns 400 when projectId is missing", async () => {
      const { GET } = await import("@/app/api/submissions/publications/route");
      const res = await GET(makeGetRequest("/api/submissions/publications"));
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/submissions/publications/[id]", () => {
    it("updates submission status", async () => {
      const submission = await testPrisma.publicationSubmission.create({
        data: {
          projectId,
          venueName: "Test Venue",
          submissionDate: new Date("2026-01-15"),
        },
      });

      const { PATCH } = await import("@/app/api/submissions/publications/[id]/route");
      const res = await PATCH(
        makePatchRequest(`/api/submissions/publications/${submission.id}`, { status: "accepted" }),
        { params: Promise.resolve({ id: submission.id }) }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("accepted");
    });

    it("returns 404 for non-existent submission", async () => {
      const { PATCH } = await import("@/app/api/submissions/publications/[id]/route");
      const res = await PATCH(
        makePatchRequest("/api/submissions/publications/nonexistent", { status: "accepted" }),
        { params: Promise.resolve({ id: "nonexistent" }) }
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/submissions/publications/[id]", () => {
    it("deletes submission and returns { success: true }", async () => {
      const submission = await testPrisma.publicationSubmission.create({
        data: {
          projectId,
          venueName: "To delete",
          submissionDate: new Date("2026-01-15"),
        },
      });

      const { DELETE } = await import("@/app/api/submissions/publications/[id]/route");
      const res = await DELETE(
        makeDeleteRequest(`/api/submissions/publications/${submission.id}`),
        { params: Promise.resolve({ id: submission.id }) }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("returns 404 for non-existent submission", async () => {
      const { DELETE } = await import("@/app/api/submissions/publications/[id]/route");
      const res = await DELETE(
        makeDeleteRequest("/api/submissions/publications/nonexistent"),
        { params: Promise.resolve({ id: "nonexistent" }) }
      );
      expect(res.status).toBe(404);
    });
  });

  describe("Access control rejection", () => {
    it("returns 403 when user lacks write access to POST /publications", async () => {
      const { verifyProjectWriteAccess } = await import("@/lib/api-auth");
      vi.mocked(verifyProjectWriteAccess).mockResolvedValueOnce({
        authorized: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      });

      const { POST } = await import("@/app/api/submissions/publications/route");
      const res = await POST(
        makePostRequest("/api/submissions/publications", {
          projectId,
          venueName: "Test Venue",
          submissionDate: "2026-01-15T00:00:00.000Z",
        })
      );
      expect(res.status).toBe(403);
    });

    it("returns 403 when user lacks read access to GET /publications", async () => {
      const { verifyProjectReadAccess } = await import("@/lib/api-auth");
      vi.mocked(verifyProjectReadAccess).mockResolvedValueOnce({
        authorized: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      });

      const { GET } = await import("@/app/api/submissions/publications/route");
      const res = await GET(makeGetRequest(`/api/submissions/publications?projectId=${projectId}`));
      expect(res.status).toBe(403);
    });
  });
});

describe("Contest Submissions API", () => {
  let projectId: string;
  let providerId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const user = await testPrisma.user.create({
      data: { email: "test@example.com", googleId: "google-123", name: "Test User" },
    });
    const project = await testPrisma.project.create({
      data: { title: "Test Project", author: "Author", userId: user.id },
    });
    projectId = project.id;
    const provider = await testPrisma.provider.create({
      data: { userId: user.id, name: "Submittable" },
    });
    providerId = provider.id;
  });

  describe("POST /api/submissions/contests", () => {
    it("creates contest submission successfully and returns 201", async () => {
      const { POST } = await import("@/app/api/submissions/contests/route");
      const res = await POST(
        makePostRequest("/api/submissions/contests", {
          projectId,
          providerId,
          contestName: "NYC Midnight Flash Fiction",
          submissionDate: "2026-03-01T00:00:00.000Z",
        })
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.contestName).toBe("NYC Midnight Flash Fiction");
      expect(body.providerId).toBe(providerId);
      expect(body.status).toBe("submitted");
    });

    it("returns 400 when providerId is missing", async () => {
      const { POST } = await import("@/app/api/submissions/contests/route");
      const res = await POST(
        makePostRequest("/api/submissions/contests", {
          projectId,
          contestName: "Test",
          submissionDate: "2026-03-01T00:00:00.000Z",
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 when providerId does not exist", async () => {
      const { POST } = await import("@/app/api/submissions/contests/route");
      const res = await POST(
        makePostRequest("/api/submissions/contests", {
          projectId,
          providerId: "nonexistent-provider",
          contestName: "Test",
          submissionDate: "2026-03-01T00:00:00.000Z",
        })
      );
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/submissions/contests", () => {
    it("returns contest submission list for project", async () => {
      await testPrisma.contestSubmission.create({
        data: {
          projectId,
          providerId,
          contestName: "Contest A",
          submissionDate: new Date("2026-03-01"),
        },
      });

      const { GET } = await import("@/app/api/submissions/contests/route");
      const res = await GET(makeGetRequest(`/api/submissions/contests?projectId=${projectId}`));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.submissions).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it("returns 400 when projectId is missing", async () => {
      const { GET } = await import("@/app/api/submissions/contests/route");
      const res = await GET(makeGetRequest("/api/submissions/contests"));
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/submissions/contests/[id]", () => {
    it("updates contest submission status", async () => {
      const submission = await testPrisma.contestSubmission.create({
        data: {
          projectId,
          providerId,
          contestName: "Test Contest",
          submissionDate: new Date("2026-03-01"),
        },
      });

      const { PATCH } = await import("@/app/api/submissions/contests/[id]/route");
      const res = await PATCH(
        makePatchRequest(`/api/submissions/contests/${submission.id}`, { status: "rejected" }),
        { params: Promise.resolve({ id: submission.id }) }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("rejected");
    });

    it("returns 404 for non-existent submission", async () => {
      const { PATCH } = await import("@/app/api/submissions/contests/[id]/route");
      const res = await PATCH(
        makePatchRequest("/api/submissions/contests/nonexistent", { status: "accepted" }),
        { params: Promise.resolve({ id: "nonexistent" }) }
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/submissions/contests/[id]", () => {
    it("deletes contest submission and returns { success: true }", async () => {
      const submission = await testPrisma.contestSubmission.create({
        data: {
          projectId,
          providerId,
          contestName: "To delete",
          submissionDate: new Date("2026-03-01"),
        },
      });

      const { DELETE } = await import("@/app/api/submissions/contests/[id]/route");
      const res = await DELETE(
        makeDeleteRequest(`/api/submissions/contests/${submission.id}`),
        { params: Promise.resolve({ id: submission.id }) }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("returns 404 for non-existent submission", async () => {
      const { DELETE } = await import("@/app/api/submissions/contests/[id]/route");
      const res = await DELETE(
        makeDeleteRequest("/api/submissions/contests/nonexistent"),
        { params: Promise.resolve({ id: "nonexistent" }) }
      );
      expect(res.status).toBe(404);
    });
  });

  describe("Access control rejection", () => {
    it("returns 403 when user lacks write access to POST /contests", async () => {
      const { verifyProjectWriteAccess } = await import("@/lib/api-auth");
      vi.mocked(verifyProjectWriteAccess).mockResolvedValueOnce({
        authorized: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      });

      const { POST } = await import("@/app/api/submissions/contests/route");
      const res = await POST(
        makePostRequest("/api/submissions/contests", {
          projectId,
          providerId,
          contestName: "Test Contest",
          submissionDate: "2026-03-01T00:00:00.000Z",
        })
      );
      expect(res.status).toBe(403);
    });

    it("returns 403 when user lacks read access to GET /contests", async () => {
      const { verifyProjectReadAccess } = await import("@/lib/api-auth");
      vi.mocked(verifyProjectReadAccess).mockResolvedValueOnce({
        authorized: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      });

      const { GET } = await import("@/app/api/submissions/contests/route");
      const res = await GET(makeGetRequest(`/api/submissions/contests?projectId=${projectId}`));
      expect(res.status).toBe(403);
    });
  });
});
