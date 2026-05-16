import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => "user-1"),
  verifyProjectWriteAccess: vi.fn(async () => ({ authorized: true })),
  verifyProjectAccess: vi.fn(async () => ({ authorized: true })),
}));
vi.mock("@/lib/ai/adk-agent", () => ({
  runChatAgent: vi.fn(async () => ({ finalContent: "ok", toolLog: [] })),
  runSimpleCompletion: vi.fn(async () => "ok"),
}));
vi.mock("@/lib/ai/settings", () => ({
  getAiConfig: vi.fn(async () => ({ apiKey: "test-key", model: "test-model" })),
  getAiPreferences: vi.fn(async () => ({})),
  buildPreferenceInstructions: vi.fn(() => ""),
  getCompressionSettings: vi.fn(async () => ({ chatWindowSize: 5, messagesUntilCompression: 15, compressionModel: "" })),
}));
vi.mock("@/lib/ai/chat-compression", () => ({ compressConversation: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: { conversation: { findUniqueOrThrow: vi.fn(async () => ({ projectId: "proj-1" })) }, chatMessage: { create: vi.fn() }, project: { findUnique: vi.fn(async () => ({ id: "proj-1" })) } } }));
vi.mock("@/lib/import-json", () => ({ importProjectJson: vi.fn(async () => ({ projectId: "imported-1" })) }));
vi.mock("@/lib/env", () => ({ env: { GITHUB_FEEDBACK_TOKEN: "tok", GITHUB_FEEDBACK_REPO: "owner/repo" } }));
vi.mock("@/lib/auth", () => ({ isGoogleAuthMode: vi.fn(() => false) }));

// Mock fetch for feedback GitHub calls
globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ id: 1 }) })) as unknown as typeof fetch;

import { POST as chatPost } from "@/app/api/chat/route";
import { POST as inlinePost } from "@/app/api/ai-inline/route";
import { POST as importPost } from "@/app/api/projects/import/route";
import { POST as feedbackPost } from "@/app/api/feedback/route";
import { GET as searchGet } from "@/app/api/projects/[id]/search/route";

function postJson(url: string, body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// ── /api/chat ─────────────────────────────────────────────────────────────────
describe("POST /api/chat — input size limits", () => {
  it("returns 413 when message exceeds 10,000 chars", async () => {
    const res = await chatPost(postJson("http://localhost/api/chat", {
      conversationId: "conv-1",
      message: "a".repeat(10_001),
    }));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("passes when message is exactly 10,000 chars", async () => {
    const res = await chatPost(postJson("http://localhost/api/chat", {
      conversationId: "conv-1",
      message: "a".repeat(10_000),
    }));
    expect(res.status).not.toBe(413);
  });

  it("returns 413 when conversationId exceeds 100 chars", async () => {
    const res = await chatPost(postJson("http://localhost/api/chat", {
      conversationId: "x".repeat(101),
      message: "Hello",
    }));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("passes when conversationId is exactly 100 chars", async () => {
    const res = await chatPost(postJson("http://localhost/api/chat", {
      conversationId: "x".repeat(100),
      message: "Hello",
    }));
    expect(res.status).not.toBe(413);
  });
});

// ── /api/ai-inline ────────────────────────────────────────────────────────────
describe("POST /api/ai-inline — input size limits", () => {
  it("returns 413 when selectedText exceeds 50,000 chars", async () => {
    const res = await inlinePost(postJson("http://localhost/api/ai-inline", {
      selectedText: "a".repeat(50_001),
      action: "rewrite-tighter",
    }));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("passes when selectedText is exactly 50,000 chars", async () => {
    const res = await inlinePost(postJson("http://localhost/api/ai-inline", {
      selectedText: "a".repeat(50_000),
      action: "rewrite-tighter",
    }));
    expect(res.status).not.toBe(413);
  });

  it("returns 413 when askPrompt exceeds 1,000 chars", async () => {
    const res = await inlinePost(postJson("http://localhost/api/ai-inline", {
      selectedText: "some text",
      action: "ask",
      askPrompt: "a".repeat(1_001),
    }));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("passes when askPrompt is exactly 1,000 chars", async () => {
    const res = await inlinePost(postJson("http://localhost/api/ai-inline", {
      selectedText: "some text",
      action: "ask",
      askPrompt: "a".repeat(1_000),
    }));
    expect(res.status).not.toBe(413);
  });

  it("passes when askPrompt is absent", async () => {
    const res = await inlinePost(postJson("http://localhost/api/ai-inline", {
      selectedText: "some text",
      action: "rewrite-tighter",
    }));
    expect(res.status).not.toBe(413);
  });
});

// ── /api/projects/import ──────────────────────────────────────────────────────
describe("POST /api/projects/import — input size limits", () => {
  it("returns 413 when Content-Length exceeds 5MB", async () => {
    const req = new NextRequest("http://localhost/api/projects/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", "content-length": String(5 * 1024 * 1024 + 1) },
      body: JSON.stringify({ project: {}, exportVersion: 1 }),
    });
    const res = await importPost(req);
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("passes when Content-Length is exactly 5MB", async () => {
    const req = new NextRequest("http://localhost/api/projects/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", "content-length": String(5 * 1024 * 1024) },
      body: JSON.stringify({ project: {}, exportVersion: 1 }),
    });
    const res = await importPost(req);
    expect(res.status).not.toBe(413);
  });

  it("does not return 413 when content-length header is absent", async () => {
    const req = new NextRequest("http://localhost/api/projects/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: {}, exportVersion: 1 }),
    });
    const res = await importPost(req);
    expect(res.status).not.toBe(413);
  });
});

// ── /api/feedback ─────────────────────────────────────────────────────────────
describe("POST /api/feedback — input size limits", () => {
  it("returns 413 when message exceeds 10,000 chars", async () => {
    const res = await feedbackPost(postJson("http://localhost/api/feedback", {
      type: "bug",
      message: "a".repeat(10_001),
    }));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 413 when email exceeds 320 chars", async () => {
    const res = await feedbackPost(postJson("http://localhost/api/feedback", {
      type: "bug",
      message: "Bug report",
      email: "a".repeat(321),
    }));
    expect(res.status).toBe(413);
  });

  it("passes when email is exactly 320 chars", async () => {
    const res = await feedbackPost(postJson("http://localhost/api/feedback", {
      type: "bug",
      message: "Bug report",
      email: "a".repeat(320),
    }));
    expect(res.status).not.toBe(413);
  });

  it("passes when email is absent", async () => {
    const res = await feedbackPost(postJson("http://localhost/api/feedback", {
      type: "bug",
      message: "Bug report",
    }));
    expect(res.status).not.toBe(413);
  });

  it("returns 413 when screenshot exceeds 3MB base64", async () => {
    const res = await feedbackPost(postJson("http://localhost/api/feedback", {
      type: "bug",
      message: "Bug report",
      screenshot: "a".repeat(3 * 1024 * 1024 + 1),
    }));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ── /api/projects/[id]/search ─────────────────────────────────────────────────
describe("GET /api/projects/[id]/search — input size limits", () => {
  function makeSearchRequest(q: string): NextRequest {
    return new NextRequest(`http://localhost/api/projects/proj-1/search?q=${encodeURIComponent(q)}`);
  }

  it("returns 413 when q exceeds 200 chars", async () => {
    const res = await searchGet(makeSearchRequest("a".repeat(201)), {
      params: Promise.resolve({ id: "proj-1" }),
    });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("passes when q is exactly 200 chars", async () => {
    const res = await searchGet(makeSearchRequest("a".repeat(200)), {
      params: Promise.resolve({ id: "proj-1" }),
    });
    expect(res.status).not.toBe(413);
  });
});
