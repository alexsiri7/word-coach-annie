import { describe, it, expect } from "vitest";
import { buildReviewPrompt, buildPlanBeatsPrompt, buildCanonCheckPrompt, REVIEW_PROMPTS } from "@/lib/review-prompts";
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

  it("DRAFT prompt references developmental feedback", () => {
    const result = buildReviewPrompt("DRAFT", undefined);
    expect(result.toLowerCase()).toMatch(/developmental|structure|pacing/);
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

describe("buildPlanBeatsPrompt", () => {
  it("returns a non-empty string", () => {
    const result = buildPlanBeatsPrompt(undefined);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("prepends scene title when provided", () => {
    const result = buildPlanBeatsPrompt("The Confrontation");
    expect(result).toMatch(/^\[Scene: The Confrontation\]/);
  });

  it("omits title prefix when title is undefined", () => {
    const result = buildPlanBeatsPrompt(undefined);
    expect(result).not.toMatch(/^\[Scene:/);
  });

  it("prompt references beats or blueprint", () => {
    const result = buildPlanBeatsPrompt(undefined);
    expect(result.toLowerCase()).toMatch(/beat|blueprint|scaffold/);
  });
});

describe("buildCanonCheckPrompt", () => {
  it("returns a non-empty string", () => {
    const result = buildCanonCheckPrompt(undefined);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("prepends scene title when provided", () => {
    const result = buildCanonCheckPrompt("The Duel");
    expect(result).toMatch(/^\[Scene: The Duel\]/);
  });

  it("omits title prefix when title is undefined", () => {
    const result = buildCanonCheckPrompt(undefined);
    expect(result).not.toMatch(/^\[Scene:/);
  });

  it("prompt contains the canon check trigger phrase", () => {
    const result = buildCanonCheckPrompt(undefined);
    expect(result.toLowerCase()).toMatch(/canon check/);
  });

  it("title is included verbatim in the prompt prefix", () => {
    const result = buildCanonCheckPrompt("Act Three: Resolution");
    expect(result).toContain("[Scene: Act Three: Resolution]");
  });
});
