import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---

const mockFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
  },
}));

vi.mock("@/lib/env", () => ({
  env: new Proxy({} as Record<string, string>, {
    get: (_t, key: string) => (mockEnv as Record<string, string>)[key],
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  RATE_LIMITS: { report: { limit: 10, windowMs: 3_600_000 } },
}));

const mockEnv: Record<string, string> = {};
const mockFetch = vi.fn();

import { POST } from "@/app/api/projects/[id]/report/route";
import { checkRateLimit } from "@/lib/rate-limit";

beforeEach(() => {
  mockFetch.mockReset();
  mockFindUnique.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
  mockEnv.GITHUB_FEEDBACK_TOKEN = "ghp_test_token";
  mockEnv.GITHUB_FEEDBACK_REPO = "testowner/testrepo";
  mockFindUnique.mockResolvedValue({ id: "proj1" });
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      html_url: "https://github.com/testowner/testrepo/issues/1",
    }),
  });
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 9, resetMs: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeRequest(
  body: object,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest("http://localhost/api/projects/proj1/report", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("POST /api/projects/[id]/report", () => {
  it("does not include reporter email in GitHub issue body", async () => {
    const res = await POST(
      makeRequest(
        { category: "harassment", details: "Bad content" },
        { "x-user-email": "private@example.com" }
      ),
      { params: Promise.resolve({ id: "proj1" }) }
    );
    expect(res.status).toBe(201);
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.body).not.toContain("private@example.com");
  });

  it("does not include reporter user ID in GitHub issue body", async () => {
    const res = await POST(
      makeRequest(
        { category: "other" },
        { "x-user-id": "user-uuid-123" }
      ),
      { params: Promise.resolve({ id: "proj1" }) }
    );
    expect(res.status).toBe(201);
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.body).not.toContain("user-uuid-123");
  });

  it("does not include project author name in GitHub issue body", async () => {
    mockFindUnique.mockResolvedValue({ id: "proj1" });
    const res = await POST(
      makeRequest({ category: "copyright" }),
      { params: Promise.resolve({ id: "proj1" }) }
    );
    expect(res.status).toBe(201);
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.body).not.toContain("Author:");
  });

  it("strips query params and hash from URL in GitHub issue body", async () => {
    const res = await POST(
      makeRequest({
        category: "illegal",
        url: "https://example.com/read/proj1?ref=email#section",
      }),
      { params: Promise.resolve({ id: "proj1" }) }
    );
    expect(res.status).toBe(201);
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.body).toContain("/read/proj1");
    expect(body.body).not.toContain("ref=email");
    expect(body.body).not.toContain("section");
    expect(body.body).not.toContain("https://example.com");
  });

  it("returns 201 (not 404) when project does not exist — prevents enumeration", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ category: "harassment" }),
      { params: Promise.resolve({ id: "nonexistent" }) }
    );
    expect(res.status).toBe(201);
    // No GitHub issue should be created
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not include project title in GitHub issue body", async () => {
    // Supply title so mock DB "returns" it — tests route output regardless of select clause
    mockFindUnique.mockResolvedValue({ id: "proj1", title: "My Story" });
    const res = await POST(
      makeRequest({ category: "copyright" }),
      { params: Promise.resolve({ id: "proj1" }) }
    );
    expect(res.status).toBe(201);
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    // Positive: correct ID-only format
    expect(body.title).toBe("Content Report: Copyright Infringement — ID: proj1");
    expect(body.body).toContain("**Project ID:** `proj1`");
    // Negative: title must not be leaked
    expect(body.body).not.toContain("My Story");
    expect(body.title).not.toContain("My Story");
  });

  it("returns 429 when rate limit exceeded", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, resetMs: 3600000 });
    const res = await POST(
      makeRequest({ category: "other" }),
      { params: Promise.resolve({ id: "proj1" }) }
    );
    expect(res.status).toBe(429);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
