import { describe, it, expect } from "vitest";
import { REVIEW_PERSONAS } from "@/lib/review-personas";

describe("REVIEW_PERSONAS", () => {
  const expectedIds = ["review-editor", "review-fan", "review-author"];

  it("defines all three persona ids", () => {
    for (const id of expectedIds) {
      expect(REVIEW_PERSONAS[id]).toBeDefined();
    }
  });

  it("each persona has a non-empty mode string", () => {
    for (const id of expectedIds) {
      expect(typeof REVIEW_PERSONAS[id].mode).toBe("string");
      expect(REVIEW_PERSONAS[id].mode.length).toBeGreaterThan(0);
    }
  });

  it("each persona has a non-empty lens string", () => {
    for (const id of expectedIds) {
      expect(typeof REVIEW_PERSONAS[id].lens).toBe("string");
      expect(REVIEW_PERSONAS[id].lens.length).toBeGreaterThan(0);
    }
  });

  it("editor lens mentions acquisitions editor", () => {
    expect(REVIEW_PERSONAS["review-editor"].lens.toLowerCase()).toContain("acquisitions editor");
  });

  it("fan lens mentions reader", () => {
    expect(REVIEW_PERSONAS["review-fan"].lens.toLowerCase()).toContain("reader");
  });

  it("author lens mentions craft or prose", () => {
    const lens = REVIEW_PERSONAS["review-author"].lens.toLowerCase();
    expect(lens).toMatch(/craft|prose/);
  });
});
