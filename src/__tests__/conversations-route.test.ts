import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => null),
  verifyProjectWriteAccess: vi.fn(async () => ({ authorized: true })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { NextRequest } from "next/server";

function makeGetRequest(projectId?: string): NextRequest {
  const url = projectId
    ? `http://localhost/api/conversations?projectId=${projectId}`
    : "http://localhost/api/conversations";
  return new NextRequest(url, { method: "GET" });
}

function makePostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/conversations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(id: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/conversations/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/conversations/${id}`, {
    method: "DELETE",
  });
}

describe("GET /api/conversations", () => {
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

  it("returns 400 without projectId", async () => {
    const { GET } = await import("@/app/api/conversations/route");
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(400);
  });

  it("returns conversations ordered by updatedAt desc", async () => {
    await testPrisma.conversation.create({
      data: { projectId, title: "Older chat" },
    });
    await new Promise((r) => setTimeout(r, 10));
    await testPrisma.conversation.create({
      data: { projectId, title: "Newer chat" },
    });

    const { GET } = await import("@/app/api/conversations/route");
    const res = await GET(makeGetRequest(projectId));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.conversations).toHaveLength(2);
    expect(body.conversations[0].title).toBe("Newer chat");
    expect(body.conversations[1].title).toBe("Older chat");
    expect(body.conversations[0].messageCount).toBeDefined();
    expect(body.conversations[0].messageCount).toBe(0);
    expect(body.conversations[0].createdAt).toBeDefined();
  });

  it("includes messageCount reflecting actual message count", async () => {
    const conversation = await testPrisma.conversation.create({
      data: { projectId, title: "Chat with messages" },
    });
    await testPrisma.chatMessage.create({
      data: { conversationId: conversation.id, role: "user", content: "Hello" },
    });
    await testPrisma.chatMessage.create({
      data: { conversationId: conversation.id, role: "assistant", content: "Hi there" },
    });

    const { GET } = await import("@/app/api/conversations/route");
    const res = await GET(makeGetRequest(projectId));
    expect(res.status).toBe(200);

    const body = await res.json();
    const found = body.conversations.find((c: { id: string }) => c.id === conversation.id);
    expect(found).toBeDefined();
    expect(found.messageCount).toBe(2);
  });

  it("returns 403 for forbidden project", async () => {
    vi.mocked(verifyProjectWriteAccess).mockResolvedValue({
      authorized: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    } as never);

    const { GET } = await import("@/app/api/conversations/route");
    const res = await GET(makeGetRequest(projectId));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/conversations", () => {
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

  it("returns 400 without projectId", async () => {
    const { POST } = await import("@/app/api/conversations/route");
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });

  it("creates conversation with default title", async () => {
    const { POST } = await import("@/app/api/conversations/route");
    const res = await POST(makePostRequest({ projectId }));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.title).toBe("New chat");
    expect(body.id).toBeDefined();
  });

  it("creates conversation with supplied title", async () => {
    const { POST } = await import("@/app/api/conversations/route");
    const res = await POST(makePostRequest({ projectId, title: "My Thread" }));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.title).toBe("My Thread");
  });

  it("returns 403 for forbidden project", async () => {
    vi.mocked(verifyProjectWriteAccess).mockResolvedValue({
      authorized: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    } as never);

    const { POST } = await import("@/app/api/conversations/route");
    const res = await POST(makePostRequest({ projectId }));
    expect(res.status).toBe(403);
  });

  it("sanitizes title before saving", async () => {
    const { POST } = await import("@/app/api/conversations/route");
    const res = await POST(makePostRequest({ projectId, title: "<script>alert('xss')</script>Thread" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).not.toContain("<script>");
  });
});

describe("PATCH /api/conversations/[id]", () => {
  let conversationId: string;
  let projectId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockReturnValue(null);
    vi.mocked(verifyProjectWriteAccess).mockResolvedValue({ authorized: true } as never);

    const project = await testPrisma.project.create({
      data: { title: "Test Novel", author: "Author" },
    });
    projectId = project.id;
    const conversation = await testPrisma.conversation.create({
      data: { projectId, title: "Original Title" },
    });
    conversationId = conversation.id;
  });

  it("returns 400 without title", async () => {
    const { PATCH } = await import("@/app/api/conversations/[id]/route");
    const req = makePatchRequest(conversationId, {});
    const res = await PATCH(req, { params: Promise.resolve({ id: conversationId }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown id", async () => {
    const { PATCH } = await import("@/app/api/conversations/[id]/route");
    const req = makePatchRequest("nonexistent", { title: "New Title" });
    const res = await PATCH(req, { params: Promise.resolve({ id: "nonexistent" }) });
    expect(res.status).toBe(404);
  });

  it("updates conversation title", async () => {
    const { PATCH } = await import("@/app/api/conversations/[id]/route");
    const req = makePatchRequest(conversationId, { title: "Renamed Thread" });
    const res = await PATCH(req, { params: Promise.resolve({ id: conversationId }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.title).toBe("Renamed Thread");
  });

  it("returns 403 for forbidden project", async () => {
    vi.mocked(verifyProjectWriteAccess).mockResolvedValue({
      authorized: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    } as never);

    const { PATCH } = await import("@/app/api/conversations/[id]/route");
    const req = makePatchRequest(conversationId, { title: "Attempt" });
    const res = await PATCH(req, { params: Promise.resolve({ id: conversationId }) });
    expect(res.status).toBe(403);
  });

  it("sanitizes title before saving", async () => {
    const { PATCH } = await import("@/app/api/conversations/[id]/route");
    const req = makePatchRequest(conversationId, { title: "<script>alert('xss')</script>Renamed" });
    const res = await PATCH(req, { params: Promise.resolve({ id: conversationId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).not.toContain("<script>");
  });
});

describe("DELETE /api/conversations/[id]", () => {
  let conversationId: string;
  let projectId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockReturnValue(null);
    vi.mocked(verifyProjectWriteAccess).mockResolvedValue({ authorized: true } as never);

    const project = await testPrisma.project.create({
      data: { title: "Test Novel", author: "Author" },
    });
    projectId = project.id;
    const conversation = await testPrisma.conversation.create({
      data: { projectId, title: "To Delete" },
    });
    conversationId = conversation.id;
  });

  it("returns 404 for unknown id", async () => {
    const { DELETE } = await import("@/app/api/conversations/[id]/route");
    const req = makeDeleteRequest("nonexistent");
    const res = await DELETE(req, { params: Promise.resolve({ id: "nonexistent" }) });
    expect(res.status).toBe(404);
  });

  it("deletes conversation and cascades messages", async () => {
    await testPrisma.chatMessage.create({
      data: { conversationId, role: "user", content: "Hello" },
    });
    await testPrisma.chatMessage.create({
      data: { conversationId, role: "assistant", content: "Hi there" },
    });

    const { DELETE } = await import("@/app/api/conversations/[id]/route");
    const req = makeDeleteRequest(conversationId);
    const res = await DELETE(req, { params: Promise.resolve({ id: conversationId }) });
    expect(res.status).toBe(200);

    const remaining = await testPrisma.conversation.findUnique({ where: { id: conversationId } });
    expect(remaining).toBeNull();

    const messages = await testPrisma.chatMessage.findMany({ where: { conversationId } });
    expect(messages).toHaveLength(0);
  });

  it("returns 403 for forbidden project", async () => {
    vi.mocked(verifyProjectWriteAccess).mockResolvedValue({
      authorized: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    } as never);

    const { DELETE } = await import("@/app/api/conversations/[id]/route");
    const req = makeDeleteRequest(conversationId);
    const res = await DELETE(req, { params: Promise.resolve({ id: conversationId }) });
    expect(res.status).toBe(403);
  });
});
