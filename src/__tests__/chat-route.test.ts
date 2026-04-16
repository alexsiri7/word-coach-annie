import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => null),
  verifyProjectWriteAccess: vi.fn(async () => ({ authorized: true })),
}));

vi.mock("@/lib/ai/adk-agent", () => ({
  runChatAgent: vi.fn(async () => ({
    finalContent: "Annie says hello!",
    toolLog: [],
  })),
}));

vi.mock("@/lib/ai/settings", () => ({
  getAiConfig: vi.fn(async () => ({ apiKey: "test-key", model: "test-model" })),
  getAiPreferences: vi.fn(async () => ({})),
  buildPreferenceInstructions: vi.fn(() => ""),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { NextRequest } from "next/server";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGetRequest(projectId?: string): NextRequest {
  const url = projectId
    ? `http://localhost/api/chat?projectId=${projectId}`
    : "http://localhost/api/chat";
  return new NextRequest(url, { method: "GET" });
}

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(projectId?: string): NextRequest {
  const url = projectId
    ? `http://localhost/api/chat?projectId=${projectId}`
    : "http://localhost/api/chat";
  return new NextRequest(url, { method: "DELETE" });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/chat", () => {
  let projectId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockReturnValue(null);
    vi.mocked(verifyProjectWriteAccess).mockResolvedValue({ authorized: true } as never);

    const project = await testPrisma.project.create({
      data: { title: "Test Novel", author: "Author" },
    });
    projectId = project.id;
  });

  it("returns 400 when projectId is missing", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(makePostRequest({ message: "hi" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when message is missing", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(makePostRequest({ projectId }));
    expect(res.status).toBe(400);
  });

  it("returns 403 for unauthorized user", async () => {
    const mockResponse = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    vi.mocked(verifyProjectWriteAccess).mockResolvedValue({
      authorized: false,
      response: mockResponse,
    } as never);

    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(makePostRequest({ projectId, message: "hi" }));
    expect(res.status).toBe(403);
  });

  it("returns streaming response for valid input", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(makePostRequest({ projectId, message: "Help with chapter 1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("sanitizes user message before saving", async () => {
    const { POST } = await import("@/app/api/chat/route");
    await POST(makePostRequest({ projectId, message: "<script>alert('xss')</script>Hello" }));

    const messages = await testPrisma.chatMessage.findMany({ where: { projectId } });
    const userMsg = messages.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();
    expect(userMsg!.content).not.toContain("<script>");
  });
});

describe("GET /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockReturnValue(null);
    vi.mocked(verifyProjectWriteAccess).mockResolvedValue({ authorized: true } as never);
  });

  it("returns 400 without projectId", async () => {
    const { GET } = await import("@/app/api/chat/route");
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(400);
  });

  it("returns chat history array", async () => {
    const project = await testPrisma.project.create({
      data: { title: "Chat Test", author: "Author" },
    });
    await testPrisma.chatMessage.create({
      data: { projectId: project.id, role: "user", content: "Hello" },
    });

    const { GET } = await import("@/app/api/chat/route");
    const res = await GET(makeGetRequest(project.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toBe("Hello");
  });
});

describe("DELETE /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockReturnValue(null);
    vi.mocked(verifyProjectWriteAccess).mockResolvedValue({ authorized: true } as never);
  });

  it("clears chat messages and returns 200", async () => {
    const project = await testPrisma.project.create({
      data: { title: "Del Test", author: "Author" },
    });
    await testPrisma.chatMessage.create({
      data: { projectId: project.id, role: "user", content: "old msg" },
    });

    const { DELETE } = await import("@/app/api/chat/route");
    const res = await DELETE(makeDeleteRequest(project.id));
    expect(res.status).toBe(200);

    const remaining = await testPrisma.chatMessage.findMany({ where: { projectId: project.id } });
    expect(remaining).toHaveLength(0);
  });
});
