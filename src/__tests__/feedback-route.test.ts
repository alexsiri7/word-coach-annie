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
    // Email must NOT appear in the public issue body
    expect(body.body).not.toContain("tester@example.com");
    // User-agent and screen size are kept for debugging utility
    expect(body.body).toContain("TestBrowser/1.0");
    expect(body.body).toContain("1920x1080");
    // URL should be pathname-only
    expect(body.body).toContain("/project/abc");
    expect(body.body).not.toContain("http://localhost:3000");
    expect(body.labels).toContain("bug");
  });

  it("does not include reporter email in GitHub issue body", async () => {
    process.env.GITHUB_FEEDBACK_TOKEN = "ghp_test_token";
    process.env.GITHUB_FEEDBACK_REPO = "testowner/testrepo";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: "https://github.com/testowner/testrepo/issues/42" }),
    });

    const res = await POST(makeRequest({
      type: "bug",
      message: "Something broke",
      email: "private@example.com",
      context: { url: "http://localhost:3000/project/abc?token=secret#myFragment", userAgent: "TestBrowser/1.0" },
    }));
    expect(res.status).toBe(201);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.body).not.toContain("private@example.com");
    // Email must NOT appear in the public issue body
    expect(body.body).not.toContain("secret");
    // URL should be pathname-only — query params and hash stripped
    expect(body.body).not.toContain("myFragment");
    expect(body.body).toContain("/project/abc");
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

  it("uploads screenshot and embeds URL in issue body", async () => {
    process.env.GITHUB_FEEDBACK_TOKEN = "ghp_test_token";
    process.env.GITHUB_FEEDBACK_REPO = "testowner/testrepo";

    // FF D8 FF E0 ... — minimal valid JPEG header in base64
    const fakeBase64 = "/9j/4AAQ";
    const fakeDataUrl = `data:image/jpeg;base64,${fakeBase64}`;
    const fakeAssetUrl =
      "https://github.com/user-attachments/assets/abc-123/feedback.jpg";

    // First call: getRepoId
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 12345 }),
    });

    // Second call: screenshot upload (issue image upload endpoint)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ href: fakeAssetUrl }),
    });

    // Third call: issue creation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        html_url: "https://github.com/testowner/testrepo/issues/99",
      }),
    });

    const res = await POST(
      makeRequest({
        type: "bug",
        message: "Screenshot bug",
        screenshot: fakeDataUrl,
      })
    );

    expect(res.status).toBe(201);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify getRepoId call
    const [repoUrl] = mockFetch.mock.calls[0];
    expect(repoUrl).toContain("/repos/testowner/testrepo");

    // Verify screenshot upload call
    const [uploadUrl] = mockFetch.mock.calls[1];
    expect(uploadUrl).toContain("/issues/uploads");

    // Verify issue body contains screenshot
    const [, issueOpts] = mockFetch.mock.calls[2];
    const issueBody = JSON.parse(issueOpts.body);
    expect(issueBody.body).toContain("### Screenshot");
    expect(issueBody.body).toContain(`![Screenshot](${fakeAssetUrl})`);
  });

  it("creates issue without screenshot section when magic bytes are invalid", async () => {
    process.env.GITHUB_FEEDBACK_TOKEN = "ghp_test_token";
    process.env.GITHUB_FEEDBACK_REPO = "testowner/testrepo";

    // Only issue creation — screenshot rejected by magic-byte check before any fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        html_url: "https://github.com/testowner/testrepo/issues/100",
      }),
    });

    const res = await POST(
      makeRequest({
        type: "bug",
        message: "Bug with failed screenshot",
        screenshot: "data:image/jpeg;base64,abc123",
      })
    );

    expect(res.status).toBe(201);

    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    const issueBody = JSON.parse(lastCall[1].body);
    expect(issueBody.body).not.toContain("### Screenshot");
    expect(issueBody.body).toContain("Bug with failed screenshot");
  });

  it("creates issue without screenshot section when GitHub upload API fails", async () => {
    process.env.GITHUB_FEEDBACK_TOKEN = "ghp_test_token";
    process.env.GITHUB_FEEDBACK_REPO = "testowner/testrepo";

    // FF D8 FF E0 — valid JPEG magic bytes, passes both checks
    const validJpegBase64 = "/9j/4AAQ";

    // getRepoId succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 12345 }),
    });

    // Screenshot upload fails (GitHub 500)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    // Issue creation succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        html_url: "https://github.com/testowner/testrepo/issues/100",
      }),
    });

    const res = await POST(
      makeRequest({
        type: "bug",
        message: "Bug with failed upload",
        screenshot: `data:image/jpeg;base64,${validJpegBase64}`,
      })
    );

    expect(res.status).toBe(201);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    const issueBody = JSON.parse(lastCall[1].body);
    expect(issueBody.body).not.toContain("### Screenshot");
    expect(issueBody.body).toContain("Bug with failed upload");
  });

  it("rejects screenshot with non-JPEG magic bytes (PNG data)", async () => {
    process.env.GITHUB_FEEDBACK_TOKEN = "ghp_test_token";
    process.env.GITHUB_FEEDBACK_REPO = "testowner/testrepo";

    // Issue creation succeeds — screenshot silently dropped
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: "https://github.com/testowner/testrepo/issues/999" }),
    });

    // PNG base64 — starts with 89 50 4E 47 (iVBOR…)
    const pngBase64 = "iVBORw0KGgoAAAANSUhEUg==";
    const res = await POST(
      makeRequest({
        type: "bug",
        message: "PNG screenshot rejected",
        screenshot: `data:image/jpeg;base64,${pngBase64}`,
      })
    );

    expect(res.status).toBe(201);
    // Only 1 fetch call — no getRepoId or upload, just issue creation
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.body).not.toContain("### Screenshot");
  });

  it("rejects screenshot with unsupported data URL prefix", async () => {
    process.env.GITHUB_FEEDBACK_TOKEN = "ghp_test_token";
    process.env.GITHUB_FEEDBACK_REPO = "testowner/testrepo";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: "https://github.com/testowner/testrepo/issues/998" }),
    });

    const res = await POST(
      makeRequest({
        type: "bug",
        message: "Bad prefix rejected",
        // Valid JPEG bytes but wrong prefix
        screenshot: "data:application/octet-stream;base64,/9j/4AAQ",
      })
    );

    expect(res.status).toBe(201);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.body).not.toContain("### Screenshot");
  });

  it("creates issue without screenshot section when no screenshot provided", async () => {
    process.env.GITHUB_FEEDBACK_TOKEN = "ghp_test_token";
    process.env.GITHUB_FEEDBACK_REPO = "testowner/testrepo";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        html_url: "https://github.com/testowner/testrepo/issues/101",
      }),
    });

    const res = await POST(
      makeRequest({
        type: "bug",
        message: "No screenshot bug",
      })
    );

    expect(res.status).toBe(201);
    expect(mockFetch).toHaveBeenCalledOnce(); // Only issue creation, no upload

    const [, issueOpts] = mockFetch.mock.calls[0];
    const issueBody = JSON.parse(issueOpts.body);
    expect(issueBody.body).not.toContain("### Screenshot");
  });

  it("omits Page line when context URL is a relative path (unparseable by URL constructor)", async () => {
    process.env.GITHUB_FEEDBACK_TOKEN = "ghp_test_token";
    process.env.GITHUB_FEEDBACK_REPO = "testowner/testrepo";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: "https://github.com/testowner/testrepo/issues/55" }),
    });

    const res = await POST(makeRequest({
      type: "bug",
      message: "Relative URL test",
      context: { url: "/project/abc" }, // relative — new URL() will throw, catch returns undefined
    }));

    expect(res.status).toBe(201);
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    // Page line should be omitted gracefully — no crash on invalid URL
    expect(body.body).not.toContain("**Page:**");
    expect(body.body).toContain("Relative URL test");
  });
});
