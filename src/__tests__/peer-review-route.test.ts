import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn().mockReturnValue("user-1"),
  verifyProjectWriteAccess: vi.fn().mockResolvedValue({ authorized: true }),
  verifyProjectReadAccess: vi.fn().mockResolvedValue({ authorized: true }),
}));

vi.mock("@/lib/ai/settings", () => ({
  getAiConfig: vi.fn().mockResolvedValue({ apiKey: "test-key", model: "test-model" }),
}));

vi.mock("@/mcp/tools/export", () => ({
  exportManuscript: vi.fn().mockResolvedValue("Once upon a time in a land far away..."),
}));

vi.mock("@/lib/ai/adk-agent", () => ({
  runSimpleCompletion: vi.fn().mockResolvedValue(
    JSON.stringify({
      overallImpression: "Great book",
      strengths: ["compelling voice"],
      weaknesses: ["slow pacing"],
      detailedFeedback: "Overall well done.",
      recommendation: "publish",
    })
  ),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    peerReview: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { POST, GET as GET_LIST } from "@/app/api/projects/[id]/peer-review/route";
import { GET as GET_DETAIL } from "@/app/api/projects/[id]/peer-review/[reviewId]/route";
import { getAiConfig } from "@/lib/ai/settings";
import { exportManuscript } from "@/mcp/tools/export";
import { runSimpleCompletion } from "@/lib/ai/adk-agent";
import { logger } from "@/lib/logger";
import { verifyProjectReadAccess } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

function makeRequest(projectId: string = "proj-1") {
  return new NextRequest(`http://localhost/api/projects/${projectId}/peer-review`, {
    method: "POST",
  });
}

function makeListRequest(url: string = "http://localhost/api/projects/proj-1/peer-review") {
  return new NextRequest(url, { method: "GET" });
}

function makeDetailRequest(projectId: string = "proj-1", reviewId: string = "rev-1") {
  return new NextRequest(`http://localhost/api/projects/${projectId}/peer-review/${reviewId}`, {
    method: "GET",
  });
}

function makeParams(id: string = "proj-1") {
  return { params: Promise.resolve({ id }) };
}

function makeDetailParams(id: string = "proj-1", reviewId: string = "rev-1") {
  return { params: Promise.resolve({ id, reviewId }) };
}

describe("POST /api/projects/:id/peer-review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to happy-path defaults
    vi.mocked(getAiConfig).mockResolvedValue({ apiKey: "test-key", model: "test-model" });
    vi.mocked(exportManuscript).mockResolvedValue("Once upon a time in a land far away...");
    vi.mocked(runSimpleCompletion).mockResolvedValue(
      JSON.stringify({
        overallImpression: "Great book",
        strengths: ["compelling voice"],
        weaknesses: ["slow pacing"],
        detailedFeedback: "Overall well done.",
        recommendation: "publish",
      })
    );
    vi.mocked(prisma.peerReview.create).mockResolvedValue({
      id: "rev-default",
      projectId: "proj-1",
      createdAt: new Date("2026-05-01T00:00:00Z"),
      publisher: { overallImpression: "Great book", strengths: ["compelling voice"], weaknesses: ["slow pacing"], detailedFeedback: "Overall well done.", recommendation: "publish" },
      reader: { overallImpression: "Great book", strengths: ["compelling voice"], weaknesses: ["slow pacing"], detailedFeedback: "Overall well done.", recommendation: "loved it" },
      writer: { overallImpression: "Great book", strengths: ["compelling voice"], weaknesses: ["slow pacing"], detailedFeedback: "Overall well done.", recommendation: "strong" },
      comedy: { overallImpression: "Great book", strengths: ["timing"], weaknesses: [], detailedFeedback: "Good comedy.", recommendation: "sharp" },
      actor: { overallImpression: "Great book", strengths: ["emotional truth"], weaknesses: [], detailedFeedback: "Earned.", recommendation: "emotionally earned" },
      consensus: { pointsOfAgreement: [], pointsOfDisagreement: [], topPriorities: [], synthesizedRecommendation: "Publish" },
    } as never);
  });

  // ─── parseJson unit tests ──────────────────────────────────────────────────

  describe("parseJson (via route integration)", () => {
    it("handles valid JSON in AI response", async () => {
      const res = await POST(makeRequest(), makeParams());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.publisher.overallImpression).toBe("Great book");
    });

    it("handles JSON wrapped in markdown code fences", async () => {
      const fencedJson = "```json\n" + JSON.stringify({
        overallImpression: "Good",
        strengths: [],
        weaknesses: [],
        detailedFeedback: "",
        recommendation: "publish",
      }) + "\n```";
      // synthesis also returns same shape, set consensus mock after the 5 reviewer mocks
      vi.mocked(runSimpleCompletion)
        .mockResolvedValueOnce(fencedJson)
        .mockResolvedValueOnce(fencedJson)
        .mockResolvedValueOnce(fencedJson)
        .mockResolvedValueOnce(fencedJson)
        .mockResolvedValueOnce(fencedJson)
        .mockResolvedValueOnce(
          JSON.stringify({
            pointsOfAgreement: [],
            pointsOfDisagreement: [],
            topPriorities: [],
            synthesizedRecommendation: "Publish it",
          })
        );
      const res = await POST(makeRequest(), makeParams());
      expect(res.status).toBe(200);
      // Verify parsed data was correctly stored — route returns DB result, so check create args
      const createArg = vi.mocked(prisma.peerReview.create).mock.calls[0][0];
      expect((createArg.data.publisher as { overallImpression?: string })?.overallImpression).toBe("Good");
    });

    it("falls back to DEFAULT_REVIEW when AI returns invalid JSON", async () => {
      vi.mocked(runSimpleCompletion)
        .mockResolvedValueOnce("not json at all") // publisher parse fails
        .mockResolvedValueOnce(
          JSON.stringify({
            overallImpression: "OK",
            strengths: [],
            weaknesses: [],
            detailedFeedback: "",
            recommendation: "revise",
          })
        ) // reader OK
        .mockResolvedValueOnce(
          JSON.stringify({
            overallImpression: "Fine",
            strengths: [],
            weaknesses: [],
            detailedFeedback: "",
            recommendation: "revise",
          })
        ) // writer OK
        .mockResolvedValueOnce(
          JSON.stringify({
            overallImpression: "Decent",
            strengths: [],
            weaknesses: [],
            detailedFeedback: "",
            recommendation: "sharp",
          })
        ) // comedy OK
        .mockResolvedValueOnce(
          JSON.stringify({
            overallImpression: "Earned",
            strengths: [],
            weaknesses: [],
            detailedFeedback: "",
            recommendation: "emotionally earned",
          })
        ) // actor OK
        .mockResolvedValueOnce(
          JSON.stringify({
            pointsOfAgreement: [],
            pointsOfDisagreement: [],
            topPriorities: [],
            synthesizedRecommendation: "Try again",
          })
        ); // synthesis OK

      const res = await POST(makeRequest(), makeParams());
      expect(res.status).toBe(200);
      // Verify the parsed fallback was passed to the DB — route returns DB result so check create args
      const createArg = vi.mocked(prisma.peerReview.create).mock.calls[0][0];
      expect((createArg.data.publisher as { overallImpression?: string })?.overallImpression).toBe("Unable to parse review");
      expect((createArg.data.reader as { overallImpression?: string })?.overallImpression).toBe("OK");
      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        expect.stringContaining("publisher"),
        expect.objectContaining({ raw: expect.any(String) })
      );
    });
  });

  // ─── Happy path ────────────────────────────────────────────────────────────

  it("returns 200 with publisher, reader, writer, consensus keys", async () => {
    // Override synthesis to return consensus-shaped JSON
    vi.mocked(runSimpleCompletion)
      .mockResolvedValueOnce(
        JSON.stringify({
          overallImpression: "Excellent",
          strengths: ["voice"],
          weaknesses: [],
          detailedFeedback: "Details",
          recommendation: "publish",
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          overallImpression: "Loved it",
          strengths: ["pacing"],
          weaknesses: [],
          detailedFeedback: "Details",
          recommendation: "loved it",
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          overallImpression: "Strong craft",
          strengths: ["dialogue"],
          weaknesses: [],
          detailedFeedback: "Details",
          recommendation: "strong",
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          overallImpression: "Funny stuff",
          strengths: ["timing"],
          weaknesses: [],
          detailedFeedback: "Details",
          recommendation: "sharp",
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          overallImpression: "Emotionally earned",
          strengths: ["emotional truth"],
          weaknesses: [],
          detailedFeedback: "Details",
          recommendation: "emotionally earned",
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          pointsOfAgreement: ["well written"],
          pointsOfDisagreement: [],
          topPriorities: ["tighten pacing"],
          synthesizedRecommendation: "Publish with minor revisions",
        })
      );
    vi.mocked(prisma.peerReview.create).mockResolvedValueOnce({
      id: "rev-1",
      projectId: "proj-1",
      createdAt: new Date("2026-05-01T00:00:00Z"),
      publisher: { overallImpression: "Excellent", strengths: ["voice"], weaknesses: [], detailedFeedback: "Details", recommendation: "publish" },
      reader: { overallImpression: "Loved it", strengths: ["pacing"], weaknesses: [], detailedFeedback: "Details", recommendation: "loved it" },
      writer: { overallImpression: "Strong craft", strengths: ["dialogue"], weaknesses: [], detailedFeedback: "Details", recommendation: "strong" },
      comedy: { overallImpression: "Funny stuff", strengths: ["timing"], weaknesses: [], detailedFeedback: "Details", recommendation: "sharp" },
      actor: { overallImpression: "Emotionally earned", strengths: ["emotional truth"], weaknesses: [], detailedFeedback: "Details", recommendation: "emotionally earned" },
      consensus: { pointsOfAgreement: ["well written"], pointsOfDisagreement: [], topPriorities: ["tighten pacing"], synthesizedRecommendation: "Publish with minor revisions" },
    } as never);

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("publisher");
    expect(body).toHaveProperty("reader");
    expect(body).toHaveProperty("writer");
    expect(body).toHaveProperty("comedy");
    expect(body).toHaveProperty("actor");
    expect(body).toHaveProperty("consensus");
    expect(body.publisher.overallImpression).toBe("Excellent");
    expect(body.consensus.synthesizedRecommendation).toBe("Publish with minor revisions");
  });

  it("makes 6 AI calls (5 reviewers + 1 synthesis)", async () => {
    vi.mocked(runSimpleCompletion)
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "A", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "publish" }))
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "B", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "loved it" }))
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "C", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "strong" }))
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "D", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "sharp" }))
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "E", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "emotionally earned" }))
      .mockResolvedValueOnce(JSON.stringify({ pointsOfAgreement: [], pointsOfDisagreement: [], topPriorities: [], synthesizedRecommendation: "Go" }));

    await POST(makeRequest(), makeParams());
    expect(vi.mocked(runSimpleCompletion)).toHaveBeenCalledTimes(6);
  });

  // ─── Warning guards ────────────────────────────────────────────────────────

  it("returns warning when AI is not configured", async () => {
    vi.mocked(getAiConfig).mockResolvedValueOnce({ apiKey: "", model: "" });
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.warning).toMatch(/AI not configured/i);
    expect(vi.mocked(runSimpleCompletion)).not.toHaveBeenCalled();
  });

  it("returns warning when manuscript is empty", async () => {
    vi.mocked(exportManuscript).mockResolvedValueOnce("   ");
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.warning).toMatch(/empty/i);
    expect(vi.mocked(runSimpleCompletion)).not.toHaveBeenCalled();
  });

  // ─── DEFAULT fallback wiring ───────────────────────────────────────────────

  it("uses DEFAULT_CONSENSUS when synthesis throws and sets consensusError", async () => {
    // 5 reviewer calls succeed, synthesis rejects
    vi.mocked(runSimpleCompletion)
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "A", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "publish" }))
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "B", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "loved it" }))
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "C", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "strong" }))
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "D", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "sharp" }))
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "E", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "emotionally earned" }))
      .mockRejectedValueOnce(new Error("synthesis timeout"));
    vi.mocked(prisma.peerReview.create).mockResolvedValueOnce({
      id: "rev-fallback",
      projectId: "proj-1",
      createdAt: new Date("2026-05-01T00:00:00Z"),
      publisher: { overallImpression: "A", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "publish" },
      reader: { overallImpression: "B", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "loved it" },
      writer: { overallImpression: "C", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "strong" },
      comedy: { overallImpression: "D", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "sharp" },
      actor: { overallImpression: "E", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "emotionally earned" },
      consensus: { pointsOfAgreement: [], pointsOfDisagreement: [], topPriorities: [], synthesizedRecommendation: "Unable to synthesize consensus" },
    } as never);

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    // Reviewer results intact
    expect(body.publisher.overallImpression).toBe("A");
    // Synthesis fell back to DEFAULT_CONSENSUS
    expect(body.consensus.synthesizedRecommendation).toBe("Unable to synthesize consensus");
    // consensusError signals the caller that synthesis failed
    expect(body.consensusError).toBe("synthesis timeout");
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      "Peer review synthesis failed",
      expect.any(Error)
    );
  });

  // ─── Persistence ──────────────────────────────────────────────────────────

  it("persists the review and returns id + createdAt", async () => {
    const createdAt = new Date("2026-05-01T12:00:00Z");
    vi.mocked(prisma.peerReview.create).mockResolvedValueOnce({
      id: "rev-1",
      projectId: "proj-7",
      createdAt,
      publisher: { overallImpression: "Great book", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "publish" },
      reader: { overallImpression: "Great book", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "loved it" },
      writer: { overallImpression: "Great book", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "strong" },
      comedy: { overallImpression: "Great book", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "sharp" },
      actor: { overallImpression: "Great book", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "emotionally earned" },
      consensus: { pointsOfAgreement: [], pointsOfDisagreement: [], topPriorities: [], synthesizedRecommendation: "Publish" },
    } as never);

    const res = await POST(makeRequest("proj-7"), makeParams("proj-7"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("rev-1");
    expect(new Date(body.createdAt).toISOString()).toBe(createdAt.toISOString());
    expect(vi.mocked(prisma.peerReview.create)).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(prisma.peerReview.create).mock.calls[0][0];
    expect(callArg.data.projectId).toBe("proj-7");
    expect(callArg.data.publisher).toBeDefined();
    expect(callArg.data.reader).toBeDefined();
    expect(callArg.data.writer).toBeDefined();
    expect(callArg.data.consensus).toBeDefined();
  });

  it("returns 500 when persistence fails", async () => {
    vi.mocked(prisma.peerReview.create).mockRejectedValueOnce(new Error("db down"));

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/internal server error/i);
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      "POST /api/projects/[id]/peer-review error",
      expect.any(Error)
    );
  });
});

describe("GET /api/projects/:id/peer-review (list)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyProjectReadAccess).mockResolvedValue({ authorized: true } as never);
  });

  it("returns paginated list newest-first", async () => {
    const r1 = { id: "r1", createdAt: new Date("2026-05-01T10:00:00Z"), consensus: { synthesizedRecommendation: "Tighten" } };
    const r2 = { id: "r2", createdAt: new Date("2026-04-28T09:00:00Z"), consensus: { synthesizedRecommendation: "Revise" } };
    vi.mocked(prisma.peerReview.findMany).mockResolvedValueOnce([r1, r2] as never);
    vi.mocked(prisma.peerReview.count).mockResolvedValueOnce(2 as never);

    const res = await GET_LIST(makeListRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.limit).toBe(20);
    expect(body.offset).toBe(0);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({
      id: "r1",
      createdAt: r1.createdAt.toISOString(),
      synthesizedRecommendation: "Tighten",
    });
    expect(body.data[1].synthesizedRecommendation).toBe("Revise");
  });

  it("clamps limit and offset and forwards them to Prisma", async () => {
    vi.mocked(prisma.peerReview.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.peerReview.count).mockResolvedValueOnce(0 as never);

    const res = await GET_LIST(
      makeListRequest("http://localhost/api/projects/proj-1/peer-review?limit=5&offset=10"),
      makeParams()
    );
    expect(res.status).toBe(200);
    const findManyArg = vi.mocked(prisma.peerReview.findMany).mock.calls[0][0]!;
    expect(findManyArg.take).toBe(5);
    expect(findManyArg.skip).toBe(10);
  });

  it("returns the auth response when read access is denied", async () => {
    const denyResponse = NextResponse.json({ error: "Forbidden" }, { status: 403 });
    vi.mocked(verifyProjectReadAccess).mockResolvedValueOnce({
      authorized: false,
      response: denyResponse,
    } as never);

    const res = await GET_LIST(makeListRequest(), makeParams());
    expect(res.status).toBe(403);
    expect(vi.mocked(prisma.peerReview.findMany)).not.toHaveBeenCalled();
  });
});

describe("GET /api/projects/:id/peer-review/:reviewId (detail)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyProjectReadAccess).mockResolvedValue({ authorized: true } as never);
  });

  it("returns the full review row when found", async () => {
    const review = {
      id: "rev-1",
      projectId: "proj-1",
      createdAt: new Date("2026-05-01T10:00:00Z"),
      publisher: { overallImpression: "P" },
      reader: { overallImpression: "R" },
      writer: { overallImpression: "W" },
      consensus: { synthesizedRecommendation: "S" },
    };
    vi.mocked(prisma.peerReview.findFirst).mockResolvedValueOnce(review as never);

    const res = await GET_DETAIL(makeDetailRequest(), makeDetailParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("rev-1");
    expect(body.publisher.overallImpression).toBe("P");
    expect(body.consensus.synthesizedRecommendation).toBe("S");
  });

  it("returns 404 when the review is not found", async () => {
    vi.mocked(prisma.peerReview.findFirst).mockResolvedValueOnce(null as never);

    const res = await GET_DETAIL(makeDetailRequest(), makeDetailParams());
    expect(res.status).toBe(404);
  });

  it("scopes the lookup to both reviewId and projectId (cross-project safety)", async () => {
    vi.mocked(prisma.peerReview.findFirst).mockResolvedValueOnce(null as never);

    await GET_DETAIL(makeDetailRequest("proj-A", "rev-from-B"), makeDetailParams("proj-A", "rev-from-B"));
    const where = vi.mocked(prisma.peerReview.findFirst).mock.calls[0][0]?.where;
    expect(where).toEqual({ id: "rev-from-B", projectId: "proj-A" });
  });
});
