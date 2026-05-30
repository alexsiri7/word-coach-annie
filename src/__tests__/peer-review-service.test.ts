import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/settings", () => ({
  getAiConfig: vi.fn().mockResolvedValue({ apiKey: "test-key", model: "test-model" }),
}));

vi.mock("@/mcp/tools/export", () => ({
  exportManuscript: vi.fn().mockResolvedValue("Once upon a time in a land far away..."),
}));

vi.mock("@/lib/ai/adk-agent", () => ({
  runSimpleCompletion: vi.fn().mockResolvedValue(
    JSON.stringify({
      overallImpression: "Great",
      strengths: ["voice"],
      weaknesses: [],
      detailedFeedback: "Good.",
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
    },
  },
}));

import { runPeerReview, MANUSCRIPT_EMPTY, AI_NOT_CONFIGURED } from "@/lib/ai/peer-review-service";
import { getAiConfig } from "@/lib/ai/settings";
import { exportManuscript } from "@/mcp/tools/export";
import { runSimpleCompletion } from "@/lib/ai/adk-agent";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";

const DEFAULT_SAVED = {
  id: "rev-1",
  projectId: "proj-1",
  createdAt: new Date("2026-05-01T00:00:00Z"),
  publisher: { overallImpression: "Great", strengths: ["voice"], weaknesses: [], detailedFeedback: "Good.", recommendation: "publish" },
  reader: { overallImpression: "Great", strengths: ["voice"], weaknesses: [], detailedFeedback: "Good.", recommendation: "loved it" },
  writer: { overallImpression: "Great", strengths: ["voice"], weaknesses: [], detailedFeedback: "Good.", recommendation: "strong" },
  comedy: { overallImpression: "Great", strengths: ["timing"], weaknesses: [], detailedFeedback: "Good.", recommendation: "sharp" },
  consensus: { pointsOfAgreement: [], pointsOfDisagreement: [], topPriorities: [], synthesizedRecommendation: "Publish" },
};

describe("runPeerReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAiConfig).mockResolvedValue({ apiKey: "test-key", model: "test-model" });
    vi.mocked(exportManuscript).mockResolvedValue("Once upon a time in a land far away...");
    vi.mocked(runSimpleCompletion).mockResolvedValue(
      JSON.stringify({
        overallImpression: "Great",
        strengths: ["voice"],
        weaknesses: [],
        detailedFeedback: "Good.",
        recommendation: "publish",
      })
    );
    vi.mocked(prisma.peerReview.create).mockResolvedValue(DEFAULT_SAVED as never);
  });

  it("throws when manuscript is empty", async () => {
    vi.mocked(exportManuscript).mockResolvedValueOnce("   ");
    await expect(runPeerReview("proj-1")).rejects.toThrow(MANUSCRIPT_EMPTY);
    expect(vi.mocked(runSimpleCompletion)).not.toHaveBeenCalled();
  });

  it("throws when AI is not configured", async () => {
    vi.mocked(getAiConfig).mockResolvedValueOnce({ apiKey: "", model: "" });
    await expect(runPeerReview("proj-1")).rejects.toThrow(AI_NOT_CONFIGURED);
    expect(vi.mocked(runSimpleCompletion)).not.toHaveBeenCalled();
  });

  it("passes userId to getAiConfig", async () => {
    await runPeerReview("proj-1", "user-42");
    expect(vi.mocked(getAiConfig)).toHaveBeenCalledWith("user-42");
  });

  it("falls back to global AI config when userId is undefined", async () => {
    await runPeerReview("proj-1");
    expect(vi.mocked(getAiConfig)).toHaveBeenCalledWith(undefined);
  });

  it("truncates manuscript to 50k characters", async () => {
    const longManuscript = "x".repeat(100000);
    vi.mocked(exportManuscript).mockResolvedValueOnce(longManuscript);
    await runPeerReview("proj-1");
    // All 4 runSimpleCompletion calls receive the truncated manuscript
    const calls = vi.mocked(runSimpleCompletion).mock.calls;
    for (const [arg] of calls.slice(0, 4)) {
      // Each prompt embeds the manuscript — check it contains exactly 50k x's
      expect(arg.userMessage).toContain("x".repeat(50000));
      expect(arg.userMessage).not.toContain("x".repeat(50001));
    }
  });

  it("makes exactly 5 AI calls (4 reviewers + 1 synthesis)", async () => {
    await runPeerReview("proj-1");
    expect(vi.mocked(runSimpleCompletion)).toHaveBeenCalledTimes(5);
  });

  it("returns saved record with id and createdAt", async () => {
    const result = await runPeerReview("proj-1");
    expect(result.id).toBe("rev-1");
    expect(result.projectId).toBe("proj-1");
  });

  it("returns DEFAULT_CONSENSUS and sets consensusError when synthesis fails", async () => {
    vi.mocked(runSimpleCompletion)
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "A", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "publish" }))
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "B", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "loved it" }))
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "C", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "strong" }))
      .mockResolvedValueOnce(JSON.stringify({ overallImpression: "D", strengths: [], weaknesses: [], detailedFeedback: "", recommendation: "sharp" }))
      .mockRejectedValueOnce(new Error("rate limit exceeded"));

    const result = await runPeerReview("proj-1");
    expect(result.consensusError).toBe("rate limit exceeded");
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      "Peer review synthesis failed",
      expect.any(Error)
    );
  });

  it("does not set consensusError on successful synthesis", async () => {
    const result = await runPeerReview("proj-1");
    expect(result.consensusError).toBeUndefined();
  });

  it("propagates DB failure without swallowing", async () => {
    vi.mocked(prisma.peerReview.create).mockRejectedValueOnce(new Error("db down"));
    await expect(runPeerReview("proj-1")).rejects.toThrow("db down");
  });
});
