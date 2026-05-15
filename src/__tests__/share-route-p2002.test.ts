import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    projectShare: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => "user-1"),
  verifyProjectAccess: vi.fn(() =>
    Promise.resolve({ authorized: true, project: { id: "proj-1", userId: "user-1" }, role: "OWNER" })
  ),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("next/server", () => {
  class MockResp {
    status: number;
    _data: unknown;
    constructor(body: unknown, init?: { status?: number }) {
      this._data = body;
      this.status = init?.status || 200;
    }
    async json() { return this._data; }
  }
  return {
    NextRequest: class {
      private _body: unknown;
      headers: Map<string, string>;
      nextUrl: { searchParams: URLSearchParams };
      constructor(url: string, init?: { body?: string; headers?: Record<string, string> }) {
        this._body = init?.body ? JSON.parse(init.body) : null;
        this.headers = new Map(Object.entries(init?.headers ?? {}));
        this.nextUrl = { searchParams: new URL(url, "http://localhost").searchParams };
      }
      get(key: string) { return this.headers.get(key) ?? null; }
      async json() { return this._body; }
    },
    NextResponse: Object.assign(
      function (body: unknown, init?: { status?: number }) {
        return new MockResp(body, init);
      } as object,
      {
        json: (data: unknown, init?: { status?: number }) => {
          const r = new MockResp(data, init);
          r._data = data;
          return r;
        },
      }
    ),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";

const mockProjectShare = prisma.projectShare as {
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

function makeRequest(body: Record<string, unknown>) {
  const { NextRequest } = require("next/server");
  return new NextRequest("http://localhost/api/projects/proj-1/share", {
    body: JSON.stringify(body),
    headers: { "x-user-id": "user-1" },
  });
}

const routeCtx = { params: Promise.resolve({ id: "proj-1" }) };

// ─── Tests ────────────────────────────────────────────────────────────

describe("POST /api/projects/[id]/share — P2002 race condition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectShare.findUnique.mockResolvedValue(null);
  });

  it("returns 409 when concurrent create hits unique constraint (P2002)", async () => {
    const { POST } = await import("@/app/api/projects/[id]/share/route");
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`projectId`,`email`)",
      { code: "P2002", clientVersion: "5.0.0", meta: {} }
    );
    mockProjectShare.create.mockRejectedValue(p2002);

    const res = await POST(makeRequest({ email: "race@example.com" }) as never, routeCtx);

    expect((res as any).status).toBe(409);
    const body = await (res as any).json();
    expect(body.error).toMatch(/already/i);
  });

  it("returns 500 for non-P2002 database errors", async () => {
    const { POST } = await import("@/app/api/projects/[id]/share/route");
    mockProjectShare.create.mockRejectedValue(new Error("DB connection lost"));

    const res = await POST(makeRequest({ email: "other@example.com" }) as never, routeCtx);

    expect((res as any).status).toBe(500);
    const body = await (res as any).json();
    expect(body.error).toMatch(/internal server error/i);
  });
});
