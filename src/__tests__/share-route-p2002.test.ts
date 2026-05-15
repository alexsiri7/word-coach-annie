import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";

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

// ─── Helpers ──────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";

const mockProjectShare = prisma.projectShare as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/projects/proj-1/share", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "x-user-id": "user-1", "content-type": "application/json" },
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
