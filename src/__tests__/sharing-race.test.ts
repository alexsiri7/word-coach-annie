import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn().mockReturnValue("user-1"),
  verifyProjectAccess: vi.fn().mockResolvedValue({
    authorized: true,
    project: { id: "proj-1", userId: "user-1" },
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const mockProjectShare = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { projectShare: mockProjectShare },
}));

vi.mock("next/server", () => {
  class MockResp {
    status: number;
    _data: unknown;
    constructor(body: unknown, init?: { status?: number }) {
      this._data = body;
      this.status = init?.status || 200;
    }
    async json() {
      return this._data;
    }
  }
  return {
    NextRequest: class {
      headers = new Map<string, string>();
      async json() {
        return null;
      }
      get(k: string) {
        return this.headers.get(k) ?? null;
      }
    },
    NextResponse: Object.assign(
      function (body: unknown, init?: { status?: number }) {
        return new MockResp(body, init);
      } as object,
      {
        json: (data: unknown, init?: { status?: number }) =>
          new MockResp(data, init),
      }
    ),
  };
});

import { POST } from "@/app/api/projects/[id]/share/route";

function makeReq(body: Record<string, unknown>) {
  return {
    headers: new Map([["x-user-id", "user-1"]]),
    get(k: string) {
      return (this.headers as Map<string, string>).get(k) ?? null;
    },
    async json() {
      return body;
    },
  };
}

const routeCtx = { params: Promise.resolve({ id: "proj-1" }) };

describe("POST /api/projects/[id]/share — race condition (P2002)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 409 when concurrent creation hits unique constraint (P2002)", async () => {
    mockProjectShare.findUnique.mockResolvedValue(null);
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`projectId`,`email`)",
      { code: "P2002", clientVersion: "5.0.0" }
    );
    mockProjectShare.create.mockRejectedValue(p2002);

    const res = await POST(makeReq({ email: "race@example.com" }) as never, routeCtx);
    expect((res as { status: number }).status).toBe(409);
    const body = await (res as { json(): Promise<{ error: string }> }).json();
    expect(body.error).toMatch(/already/i);
  });

  it("returns 500 for non-P2002 database errors", async () => {
    mockProjectShare.findUnique.mockResolvedValue(null);
    mockProjectShare.create.mockRejectedValue(new Error("DB connection lost"));

    const res = await POST(makeReq({ email: "error@example.com" }) as never, routeCtx);
    expect((res as { status: number }).status).toBe(500);
  });
});
