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
  },
}));

vi.mock("@/lib/controllers/universes", () => ({
  UniversesController: {
    addTimelineEntry: vi.fn(async (data) => ({ id: "entry-1", ...data })),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { UniversesController } from "@/lib/controllers/universes";
import { POST } from "@/app/api/world-objects/[id]/timeline/route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/world-objects/wo-1/timeline",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

const mockParams = { params: Promise.resolve({ id: "wo-1" }) };

describe("POST /api/world-objects/[id]/timeline — Zod validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when label is missing", async () => {
    const res = await POST(makeRequest({ description: "some desc" }), mockParams);
    const body = await res.json();
    expect(res.status).toBe(400);
    // Zod v4 reports type error when label is absent entirely; validation still rejects it
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when label is empty string", async () => {
    const res = await POST(makeRequest({ label: "" }), mockParams);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("label is required");
  });

  it("passes validated data (not raw body) to controller — strips internal fields", async () => {
    const res = await POST(
      makeRequest({ label: "Event", id: "injected-id", worldObjectId: "injected-wo" }),
      mockParams
    );
    expect(res.status).toBe(200);
    const call = vi.mocked(UniversesController.addTimelineEntry).mock.calls[0][0];
    expect(call).not.toHaveProperty("id");
    // worldObjectId is set from URL param, not from body
    expect(call.label).toBe("Event");
    expect(call.worldObjectId).toBe("wo-1");
  });

  it("accepts valid body and returns 200", async () => {
    const res = await POST(
      makeRequest({ label: "Battle of Helm's Deep", orderIndex: 0 }),
      mockParams
    );
    expect(res.status).toBe(200);
  });

  it("rejects float orderIndex with 400", async () => {
    const res = await POST(
      makeRequest({ label: "Event", orderIndex: 1.5 }),
      mockParams
    );
    expect(res.status).toBe(400);
  });
});
