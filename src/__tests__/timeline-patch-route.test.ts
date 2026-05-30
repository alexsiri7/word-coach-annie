import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn(() => "user-1"),
  verifyUniverseAccess: vi.fn(async () => ({ authorized: true })),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    worldObject: { findUnique: vi.fn(async () => ({ universeId: "u-1" })) },
    worldObjectTimelineEntry: {
      findFirst: vi.fn(async () => ({ id: "entry-1" })),
    },
  },
}));

vi.mock("@/lib/controllers/universes", () => ({
  UniversesController: {
    updateTimelineEntry: vi.fn(async (id, data) => ({ id, ...data })),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { UniversesController } from "@/lib/controllers/universes";
import { PATCH } from "@/app/api/world-objects/[id]/timeline/[entryId]/route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/world-objects/wo-1/timeline/entry-1",
    { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
  );
}

const mockParams = { params: Promise.resolve({ id: "wo-1", entryId: "entry-1" }) };

describe("PATCH /api/world-objects/[id]/timeline/[entryId] — Zod validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for empty body (no fields to update)", async () => {
    const res = await PATCH(makeRequest({}), mockParams);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("No fields to update");
  });

  it("returns 400 when label is present but empty string", async () => {
    const res = await PATCH(makeRequest({ label: "" }), mockParams);
    expect(res.status).toBe(400);
  });

  it("strips internal fields from update payload", async () => {
    await PATCH(makeRequest({ label: "Updated", id: "injected", createdAt: "2020" }), mockParams);
    const call = vi.mocked(UniversesController.updateTimelineEntry).mock.calls[0][1];
    expect(call).not.toHaveProperty("id");
    expect(call).not.toHaveProperty("createdAt");
    expect(call.label).toBe("Updated");
  });

  it("accepts valid partial update and returns 200", async () => {
    const res = await PATCH(makeRequest({ description: "new desc" }), mockParams);
    expect(res.status).toBe(200);
  });

  it("rejects float orderIndex with 400", async () => {
    const res = await PATCH(makeRequest({ orderIndex: 2.7 }), mockParams);
    expect(res.status).toBe(400);
  });
});
