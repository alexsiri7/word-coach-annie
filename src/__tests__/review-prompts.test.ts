import { describe, it, expect } from "vitest";
import { buildReviewPrompt, REVIEW_PROMPTS } from "@/lib/review-prompts";
import type { SceneStatus } from "@/lib/types";

describe("REVIEW_PROMPTS", () => {
  it("defines a non-empty prompt for each valid status", () => {
    const statuses: SceneStatus[] = ["OUTLINE", "DRAFT", "REVISED", "FINAL"];
    for (const status of statuses) {
      expect(REVIEW_PROMPTS[status]).toBeDefined();
      expect(typeof REVIEW_PROMPTS[status]).toBe("string");
      expect(REVIEW_PROMPTS[status].length).toBeGreaterThan(0);
    }
  });
});

describe("buildReviewPrompt", () => {
  it("returns a non-empty prompt for each valid status", () => {
    const statuses: SceneStatus[] = ["OUTLINE", "DRAFT", "REVISED", "FINAL"];
    for (const status of statuses) {
      const result = buildReviewPrompt(status, undefined);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it("prepends scene title when provided", () => {
    const result = buildReviewPrompt("DRAFT", "Act Two");
    expect(result).toMatch(/^\[Scene: Act Two\]/);
  });

  it("omits title prefix when title is undefined", () => {
    const result = buildReviewPrompt("DRAFT", undefined);
    expect(result).not.toMatch(/^\[Scene:/);
  });

  it("OUTLINE prompt focuses on plot structure", () => {
    const result = buildReviewPrompt("OUTLINE", undefined);
    expect(result.toLowerCase()).toMatch(/plot|structure|outline/);
  });

  it("REVISED prompt focuses on line-level review", () => {
    const result = buildReviewPrompt("REVISED", undefined);
    expect(result.toLowerCase()).toMatch(/line|rhythm|word choice|voice/);
  });

  it("FINAL prompt focuses on continuity check", () => {
    const result = buildReviewPrompt("FINAL", undefined);
    expect(result.toLowerCase()).toMatch(/continuity|consistency/);
  });

  it("title is included verbatim in the prompt prefix", () => {
    const result = buildReviewPrompt("OUTLINE", "The Opening Scene");
    expect(result).toContain("[Scene: The Opening Scene]");
  });
});
