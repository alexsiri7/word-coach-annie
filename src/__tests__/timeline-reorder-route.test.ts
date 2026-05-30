import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => "user-1"),
  verifyUniverseAccess: vi.fn(async () => ({ authorized: true })),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    worldObject: {
      findUnique: vi.fn(async () => ({ universeId: "universe-1" })),
    },
    worldObjectTimelineEntry: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/controllers/universes", () => ({
  UniversesController: {
    reorderTimelineEntries: vi.fn(async () => undefined),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { prisma } from "@/lib/db";
import { POST } from "@/app/api/world-objects/[id]/timeline/reorder/route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/world-objects/wo-1/timeline/reorder",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

const mockParams = { params: Promise.resolve({ id: "wo-1" }) };

describe("POST /api/world-objects/[id]/timeline/reorder — route-level ownership check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: worldObject belongs to universe-1
    vi.mocked(prisma.worldObject.findUnique).mockResolvedValue({
      universeId: "universe-1",
    } as any);
  });

  it("returns 400 when orderedIds contain entries from a different world object", async () => {
    // 2 IDs submitted but only 1 belongs to wo-1
    vi.mocked(prisma.worldObjectTimelineEntry.findMany).mockResolvedValue([
      { id: "entry-1" },
    ] as any);

    const res = await POST(
      makeRequest({ orderedIds: ["entry-1", "entry-from-other-wo"] }),
      mockParams
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe(
      "Some timeline entries do not belong to this world object"
    );
  });

  it("returns 400 with distinct message when orderedIds contains duplicates", async () => {
    const res = await POST(
      makeRequest({ orderedIds: ["entry-1", "entry-1"] }),
      mockParams
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("orderedIds contains duplicate entries");
    // Ownership DB query should not be called for duplicates
    expect(prisma.worldObjectTimelineEntry.findMany).not.toHaveBeenCalled();
  });

  it("skips the ownership DB query and succeeds when orderedIds is empty", async () => {
    const res = await POST(makeRequest({ orderedIds: [] }), mockParams);

    expect(res.status).toBe(200);
    expect(prisma.worldObjectTimelineEntry.findMany).not.toHaveBeenCalled();
  });

  it("proceeds to reorder when all IDs are owned", async () => {
    vi.mocked(prisma.worldObjectTimelineEntry.findMany).mockResolvedValue([
      { id: "e1" },
      { id: "e2" },
    ] as any);

    const res = await POST(makeRequest({ orderedIds: ["e1", "e2"] }), mockParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("returns 400 when orderedIds is not an array", async () => {
    const res = await POST(makeRequest({ orderedIds: "not-an-array" }), mockParams);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("orderedIds must be an array");
  });
});
