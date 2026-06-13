import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => "test-user-id"),
  verifyProjectWriteAccess: vi.fn(async () => ({ authorized: true })),
}));

vi.mock("@/lib/controllers/hashnode-publish", () => ({
  HashnodePublishController: {
    publish: vi.fn(async () => ({
      hashnodePostUrl: "https://test.hashnode.dev/post",
      hashnodePostId: "post-123",
      publishStatus: "draft",
    })),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest("http://localhost/api/projects/proj-1/publish-to-hashnode", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const routeParams = { params: Promise.resolve({ id: "proj-1" }) };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/projects/[id]/publish-to-hashnode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("canonicalUrl validation", () => {
    it("rejects javascript: URI", async () => {
      const { POST } = await import("@/app/api/projects/[id]/publish-to-hashnode/route");
      const res = await POST(makeRequest({ canonicalUrl: "javascript:alert(1)" }), routeParams);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("canonicalUrl must be an absolute HTTPS URL");
    });

    it("rejects http:// URL (non-https)", async () => {
      const { POST } = await import("@/app/api/projects/[id]/publish-to-hashnode/route");
      const res = await POST(makeRequest({ canonicalUrl: "http://example.com" }), routeParams);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("canonicalUrl must be an absolute HTTPS URL");
    });

    it("rejects plain string", async () => {
      const { POST } = await import("@/app/api/projects/[id]/publish-to-hashnode/route");
      const res = await POST(makeRequest({ canonicalUrl: "not-a-url" }), routeParams);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("canonicalUrl must be a valid URL");
    });

    it("rejects null canonicalUrl", async () => {
      const { POST } = await import("@/app/api/projects/[id]/publish-to-hashnode/route");
      const res = await POST(makeRequest({ canonicalUrl: null }), routeParams);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/canonicalUrl/);
    });

    it("accepts valid https URL", async () => {
      const { POST } = await import("@/app/api/projects/[id]/publish-to-hashnode/route");
      const res = await POST(
        makeRequest({ canonicalUrl: "https://mysite.com/article" }),
        routeParams,
      );
      expect(res.status).toBe(201);
    });

    it("accepts undefined canonicalUrl", async () => {
      const { POST } = await import("@/app/api/projects/[id]/publish-to-hashnode/route");
      const res = await POST(makeRequest({}), routeParams);
      expect(res.status).toBe(201);
    });
  });
});
