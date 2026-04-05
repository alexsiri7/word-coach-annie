import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock AI settings and ADK agent
vi.mock("@/lib/ai/settings", () => ({
  getAiConfig: vi.fn().mockResolvedValue({
        apiKey: "test-key",
    model: "test-model",
  }),
  getAiPreferences: vi.fn().mockResolvedValue({
    customInstructions: "",
    coachingStyle: "balanced",
    responseLength: "moderate",
  }),
  buildPreferenceInstructions: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn().mockReturnValue("user-1"),
}));

vi.mock("@/lib/ai/adk-agent", () => ({
  runSimpleCompletion: vi.fn().mockResolvedValue("Rewritten text result"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/sanitize-server", () => ({
  sanitizeInput: vi.fn((x: string) => x),
}));

import { POST } from "@/app/api/ai-inline/route";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/ai-inline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai-inline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when selectedText is missing", async () => {
    const req = makeRequest({ action: "rewrite-tighter" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it("returns 400 when action is missing", async () => {
    const req = makeRequest({ selectedText: "Some text" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it("returns 400 for unknown action", async () => {
    const req = makeRequest({ selectedText: "Some text", action: "unknown-action" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unknown action/i);
  });

  it("returns result for rewrite-tighter action", async () => {
    const req = makeRequest({ selectedText: "Some text to rewrite", action: "rewrite-tighter" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBe("Rewritten text result");
  });

  it("returns result for voice-check action", async () => {
    const req = makeRequest({
      selectedText: "Some text",
      action: "voice-check",
      sceneContext: "Chapter 1 context",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBe("Rewritten text result");
  });

  it("returns result for ask action with custom prompt", async () => {
    const req = makeRequest({
      selectedText: "Some text",
      action: "ask",
      askPrompt: "What does this mean?",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBe("Rewritten text result");
  });

  it("returns 503 when AI is not configured", async () => {
    const { getAiConfig } = await import("@/lib/ai/settings");
    vi.mocked(getAiConfig).mockResolvedValueOnce({ apiKey: "", model: "" });
    const req = makeRequest({ selectedText: "text", action: "expand" });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });
});
