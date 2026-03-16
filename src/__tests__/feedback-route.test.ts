import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/feedback/route";

// Mock fetch globally for GitHub API calls
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GITHUB_FEEDBACK_TOKEN;
  delete process.env.GITHUB_FEEDBACK_REPO;
});

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/feedback", () => {
  it("returns 400 when message is empty", async () => {
    const res = await POST(makeRequest({ type: "bug", message: "" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/message/i);
  });

  it("returns 400 when type is invalid", async () => {
    const res = await POST(
      makeRequest({ type: "invalid", message: "Hello" })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/type/i);
  });

  it("returns 503 when GitHub config is missing", async () => {
    delete process.env.GITHUB_FEEDBACK_TOKEN;
    delete process.env.GITHUB_FEEDBACK_REPO;
    const res = await POST(
      makeRequest({ type: "bug", message: "Something broke" })
    );
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toMatch(/not configured/i);
  });

  it("creates GitHub issue on valid request", async () => {
    process.env.GITHUB_FEEDBACK_TOKEN = "ghp_test_token";
    process.env.GITHUB_FEEDBACK_REPO = "testowner/testrepo";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        html_url: "https://github.com/testowner/testrepo/issues/42",
      }),
    });

    const res = await POST(
      makeRequest({
        type: "bug",
        message: "The editor crashes when pasting images",
        email: "tester@example.com",
        context: {
          url: "http://localhost:3000/project/abc",
          userAgent: "TestBrowser/1.0",
          screenSize: "1920x1080",
        },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.issueUrl).toBe(
      "https://github.com/testowner/testrepo/issues/42"
    );

    // Verify the fetch call to GitHub API
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://api.github.com/repos/testowner/testrepo/issues"
    );
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer ghp_test_token");

    const body = JSON.parse(options.body);
    expect(body.title).toContain("Bug:");
    expect(body.title).toContain("editor crashes");
    expect(body.body).toContain("tester@example.com");
    expect(body.body).toContain("TestBrowser/1.0");
    expect(body.body).toContain("1920x1080");
    expect(body.labels).toContain("bug");
  });

  it("returns 502 when GitHub API fails", async () => {
    process.env.GITHUB_FEEDBACK_TOKEN = "ghp_test_token";
    process.env.GITHUB_FEEDBACK_REPO = "testowner/testrepo";

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ message: "Validation Failed" }),
    });

    const res = await POST(
      makeRequest({ type: "feature", message: "Add dark mode" })
    );
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toMatch(/failed/i);
  });

  it("uses correct labels per feedback type", async () => {
    process.env.GITHUB_FEEDBACK_TOKEN = "ghp_test_token";
    process.env.GITHUB_FEEDBACK_REPO = "testowner/testrepo";

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: "https://github.com/issues/1" }),
    });

    // Feature request
    await POST(makeRequest({ type: "feature", message: "Add export" }));
    let body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.labels).toContain("enhancement");
    expect(body.title).toMatch(/^Feature:/);

    // General feedback
    await POST(makeRequest({ type: "other", message: "Nice app" }));
    body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body.labels).toContain("feedback");
    expect(body.title).not.toMatch(/^(Bug|Feature):/);
  });
});
