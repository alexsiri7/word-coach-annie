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
      findFirst: vi.fn(async () => ({ id: "entry-1" })),
    },
  },
}));

vi.mock("@/lib/controllers/universes", () => ({
  UniversesController: {
    addTimelineEntry: vi.fn(async (data: Record<string, unknown>) => ({
      id: "entry-1",
      ...data,
    })),
    updateTimelineEntry: vi.fn(async (_id: string, data: Record<string, unknown>) => ({
      id: "entry-1",
      ...data,
    })),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { UniversesController } from "@/lib/controllers/universes";
import { POST } from "@/app/api/world-objects/[id]/timeline/route";
import { PATCH } from "@/app/api/world-objects/[id]/timeline/[entryId]/route";

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/world-objects/wo-1/timeline",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/world-objects/wo-1/timeline/entry-1",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

const postParams = { params: Promise.resolve({ id: "wo-1" }) };
const patchParams = {
  params: Promise.resolve({ id: "wo-1", entryId: "entry-1" }),
};

describe("POST /api/world-objects/[id]/timeline — Zod validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when label is missing", async () => {
    const res = await POST(makePostRequest({}), postParams);
    expect(res.status).toBe(400);
  });

  it("returns 400 when label is empty", async () => {
    const res = await POST(makePostRequest({ label: "" }), postParams);
    expect(res.status).toBe(400);
  });

  it("returns 201-level response with valid input", async () => {
    const res = await POST(
      makePostRequest({ label: "Age 20", description: "desc" }),
      postParams
    );
    expect(res.status).toBe(200);
  });

  it("strips injected fields and passes only whitelisted data to controller", async () => {
    await POST(
      makePostRequest({
        label: "Age 20",
        id: "injected",
        worldObjectId: "injected",
        createdAt: "2024-01-01",
      }),
      postParams
    );
    const callArg = vi.mocked(UniversesController.addTimelineEntry).mock
      .calls[0][0];
    expect(callArg).not.toHaveProperty("id");
    expect(callArg).not.toHaveProperty("createdAt");
    // worldObjectId should be route-injected, not user-injected
    expect(callArg).toHaveProperty("worldObjectId", "wo-1");
  });
});

describe("PATCH /api/world-objects/[id]/timeline/[entryId] — Zod validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when body is empty (no fields to update)", async () => {
    const res = await PATCH(makePatchRequest({}), patchParams);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("No fields to update");
  });

  it("returns 200 with valid partial update", async () => {
    const res = await PATCH(
      makePatchRequest({ label: "Updated" }),
      patchParams
    );
    expect(res.status).toBe(200);
  });

  it("strips injected fields from update payload", async () => {
    await PATCH(
      makePatchRequest({
        label: "Updated",
        id: "injected",
        worldObjectId: "injected",
      }),
      patchParams
    );
    const callArg = vi.mocked(UniversesController.updateTimelineEntry).mock
      .calls[0];
    expect(callArg[0]).toBe("entry-1"); // entryId
    expect(callArg[1]).not.toHaveProperty("id");
    expect(callArg[1]).not.toHaveProperty("worldObjectId");
    expect(callArg[1]).toHaveProperty("label", "Updated");
  });
});
