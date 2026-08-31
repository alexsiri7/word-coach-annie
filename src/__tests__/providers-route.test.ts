import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn().mockReturnValue("user-1"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/sanitize-server", () => ({
  sanitizeInput: vi.fn((s: string) => s),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    provider: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { GET, POST } from "@/app/api/providers/route";
import { PATCH, DELETE } from "@/app/api/providers/[id]/route";
import { getCurrentUserId } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

const now = new Date("2026-08-01T00:00:00Z");

function makeProvider(overrides = {}) {
  return {
    id: "prov-1",
    userId: "user-1",
    name: "Test Provider",
    website: "",
    notes: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("GET /api/providers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue(null);
    const req = new NextRequest("http://localhost/api/providers");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("lists providers for authenticated user", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("user-1");
    vi.mocked(prisma.provider.findMany).mockResolvedValue([makeProvider()]);
    const req = new NextRequest("http://localhost/api/providers");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providers).toHaveLength(1);
    expect(body.providers[0].name).toBe("Test Provider");
  });
});

describe("POST /api/providers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue(null);
    const req = new NextRequest("http://localhost/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("user-1");
    const req = new NextRequest("http://localhost/api/providers", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing name", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("user-1");
    const req = new NextRequest("http://localhost/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates provider successfully", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("user-1");
    vi.mocked(prisma.provider.create).mockResolvedValue(makeProvider({ name: "New Provider" }));
    const req = new NextRequest("http://localhost/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Provider" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("New Provider");
  });
});

describe("PATCH /api/providers/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when provider not found", async () => {
    vi.mocked(prisma.provider.findUnique).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/providers/prov-missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "prov-missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user does not own provider", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("user-2");
    vi.mocked(prisma.provider.findUnique).mockResolvedValue(makeProvider());
    const req = new NextRequest("http://localhost/api/providers/prov-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "prov-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 for empty update", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("user-1");
    vi.mocked(prisma.provider.findUnique).mockResolvedValue(makeProvider());
    const req = new NextRequest("http://localhost/api/providers/prov-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "prov-1" }) });
    expect(res.status).toBe(400);
  });

  it("updates provider successfully", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("user-1");
    vi.mocked(prisma.provider.findUnique).mockResolvedValue(makeProvider());
    vi.mocked(prisma.provider.update).mockResolvedValue(makeProvider({ name: "Updated" }));
    const req = new NextRequest("http://localhost/api/providers/prov-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "prov-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated");
  });
});

describe("DELETE /api/providers/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when provider not found", async () => {
    vi.mocked(prisma.provider.findUnique).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/providers/prov-missing", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "prov-missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 409 when provider has submissions (P2003)", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("user-1");
    vi.mocked(prisma.provider.findUnique).mockResolvedValue(makeProvider());

    // Simulate P2003 FK constraint error
    const { Prisma } = await import("@prisma/client");
    vi.mocked(prisma.provider.delete).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("FK constraint failed", {
        code: "P2003",
        clientVersion: "5.0.0",
      })
    );

    const req = new NextRequest("http://localhost/api/providers/prov-1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "prov-1" }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("cannot be deleted");
  });

  it("deletes provider successfully", async () => {
    vi.mocked(getCurrentUserId).mockReturnValue("user-1");
    vi.mocked(prisma.provider.findUnique).mockResolvedValue(makeProvider());
    vi.mocked(prisma.provider.delete).mockResolvedValue(makeProvider());
    const req = new NextRequest("http://localhost/api/providers/prov-1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "prov-1" }) });
    expect(res.status).toBe(200);
  });
});
