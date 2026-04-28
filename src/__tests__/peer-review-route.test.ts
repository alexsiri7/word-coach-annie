import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", () => ({
  getCurrentUserId: vi.fn().mockReturnValue("user-1"),
  verifyProjectWriteAccess: vi.fn().mockResolvedValue({ authorized: true }),
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

import { POST } from "@/app/api/projects/[id]/peer-review/route";
import { getAiConfig } from "@/lib/ai/settings";
import { exportManuscript } from "@/mcp/tools/export";
import { runSimpleCompletion } from "@/lib/ai/adk-agent";
import { logger } from "@/lib/logger";

function makeRequest(projectId: string = "proj-1") {
  return new NextRequest(`http://localhost/api/projects/${projectId}/peer-review`, {
    method: "POST",
  });
}

function makeParams(id: string = "proj-1") {
  return { params: Promise.resolve({ id }) };
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
      // synthesis also returns same shape, set consensus mock after the 3 reviewer mocks
      vi.mocked(runSimpleCompletion)
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
      const body = await res.json();
      expect(body.publisher.overallImpression).toBe("Good");
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
            pointsOfAgreement: [],
            pointsOfDisagreement: [],
            topPriorities: [],
            synthesizedRecommendation: "Try again",
          })
        ); // synthesis OK

      const res = await POST(makeRequest(), makeParams());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.publisher.overallImpression).toBe("Unable to parse review");
      expect(body.reader.overallImpression).toBe("OK");
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
          pointsOfAgreement: ["well written"],
          pointsOfDisagreement: [],
          topPriorities: ["tighten pacing"],
          synthesizedRecommendation: "Publish with minor revisions",
        })
      );

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("publisher");
    expect(body).toHaveProperty("reader");
    expect(body).toHaveProperty("writer");
    expect(body).toHaveProperty("consensus");
    expect(body.publisher.overallImpression).toBe("Excellent");
    expect(body.consensus.synthesizedRecommendation).toBe("Publish with minor revisions");
  });

  it("makes 4 AI calls (3 reviewers + 1 synthesis)", async () => {
    vi.mocked(runSimpleCompletion)
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "A", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "publish" }))
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "B", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "loved it" }))
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "C", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "strong" }))
      .mockResolvedValueOnce(JSON.stringify({ pointsOfAgreement: [], pointsOfDisagreement: [], topPriorities: [], synthesizedRecommendation: "Go" }));

    await POST(makeRequest(), makeParams());
    expect(vi.mocked(runSimpleCompletion)).toHaveBeenCalledTimes(4);
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

  it("uses DEFAULT_CONSENSUS when synthesis throws", async () => {
    // 3 reviewer calls succeed, synthesis rejects
    vi.mocked(runSimpleCompletion)
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "A", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "publish" }))
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "B", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "loved it" }))
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "C", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "strong" }))
      .mockRejectedValueOnce(new Error("synthesis timeout"));

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    // Reviewer results intact
    expect(body.publisher.overallImpression).toBe("A");
    // Synthesis fell back to DEFAULT_CONSENSUS
    expect(body.consensus.synthesizedRecommendation).toBe("Unable to synthesize consensus");
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      "Peer review synthesis failed",
      expect.any(Error)
    );
  });
});
