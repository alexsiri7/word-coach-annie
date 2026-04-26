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
  runSimpleCompletion: vi.fn(async () => "Draft and Revision"),
}));

vi.mock("@/lib/ai/settings", () => ({
  getAiConfig: vi.fn(async () => ({ apiKey: "test-key", model: "test-model" })),
  getAiPreferences: vi.fn(async () => ({})),
  buildPreferenceInstructions: vi.fn(() => ""),
  getCompressionSettings: vi.fn(async () => ({
    chatWindowSize: 5,
    messagesUntilCompression: 15,
    compressionModel: "",
  })),
}));

vi.mock("@/lib/ai/chat-compression", () => ({
  compressConversation: vi.fn(async () => undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { NextRequest } from "next/server";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGetRequest(conversationId?: string): NextRequest {
  const url = conversationId
    ? `http://localhost/api/chat?conversationId=${conversationId}`
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

function makeDeleteRequest(conversationId?: string): NextRequest {
  const url = conversationId
    ? `http://localhost/api/chat?conversationId=${conversationId}`
    : "http://localhost/api/chat";
  return new NextRequest(url, { method: "DELETE" });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/chat", () => {
  let conversationId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockReturnValue(null);
    vi.mocked(verifyProjectWriteAccess).mockResolvedValue({ authorized: true } as never);

    const project = await testPrisma.project.create({
      data: { title: "Test Novel", author: "Author" },
    });
    const conversation = await testPrisma.conversation.create({
      data: { projectId: project.id, title: "Test chat" },
    });
    conversationId = conversation.id;
  });

  it("returns 400 when conversationId is missing", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(makePostRequest({ message: "hi" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when message is missing", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(makePostRequest({ conversationId }));
    expect(res.status).toBe(400);
  });

  it("returns 403 for unauthorized user", async () => {
    const mockResponse = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    vi.mocked(verifyProjectWriteAccess).mockResolvedValue({
      authorized: false,
      response: mockResponse,
    } as never);

    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(makePostRequest({ conversationId, message: "hi" }));
    expect(res.status).toBe(403);
  });

  it("returns streaming response for valid input", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const res = await POST(makePostRequest({ conversationId, message: "Help with chapter 1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
  });

  it("sanitizes user message before saving", async () => {
    const { POST } = await import("@/app/api/chat/route");
    await POST(makePostRequest({ conversationId, message: "<script>alert('xss')</script>Hello" }));

    const messages = await testPrisma.chatMessage.findMany({ where: { conversationId } });
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

  it("returns 400 without conversationId", async () => {
    const { GET } = await import("@/app/api/chat/route");
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(400);
  });

  it("returns conversation and chat history", async () => {
    const project = await testPrisma.project.create({
      data: { title: "Chat Test", author: "Author" },
    });
    const conversation = await testPrisma.conversation.create({
      data: { projectId: project.id, title: "Test chat" },
    });
    await testPrisma.chatMessage.create({
      data: { conversationId: conversation.id, role: "user", content: "Hello" },
    });

    const { GET } = await import("@/app/api/chat/route");
    const res = await GET(makeGetRequest(conversation.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.conversation).toBeDefined();
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
    const conversation = await testPrisma.conversation.create({
      data: { projectId: project.id, title: "Test chat" },
    });
    await testPrisma.chatMessage.create({
      data: { conversationId: conversation.id, role: "user", content: "old msg" },
    });

    const { DELETE } = await import("@/app/api/chat/route");
    const res = await DELETE(makeDeleteRequest(conversation.id));
    expect(res.status).toBe(200);

    const remaining = await testPrisma.chatMessage.findMany({ where: { conversationId: conversation.id } });
    expect(remaining).toHaveLength(0);
  });
});
