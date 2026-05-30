import { describe, it, expect } from "vitest";
import { REVIEW_PERSONAS } from "@/lib/review-personas";

describe("REVIEW_PERSONAS", () => {
  const personaIds = Object.keys(REVIEW_PERSONAS);

  it("defines exactly four personas", () => {
    expect(personaIds).toHaveLength(4);
  });

  it("defines all four expected persona ids", () => {
    expect(personaIds).toContain("review-editor");
    expect(personaIds).toContain("review-fan");
    expect(personaIds).toContain("review-author");
    expect(personaIds).toContain("review-comedy");
  });

  it("each persona has a non-empty mode string", () => {
    for (const id of personaIds) {
      expect(typeof REVIEW_PERSONAS[id].mode).toBe("string");
      expect(REVIEW_PERSONAS[id].mode.length).toBeGreaterThan(0);
    }
  });

  it("each persona lens is a function that returns a non-empty string", () => {
    for (const id of personaIds) {
      expect(typeof REVIEW_PERSONAS[id].lens).toBe("function");
      const result = REVIEW_PERSONAS[id].lens("Test Novel");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it("each persona lens interpolates the project title", () => {
    for (const id of personaIds) {
      const result = REVIEW_PERSONAS[id].lens("Test Novel");
      expect(result).toContain("Test Novel");
    }
  });

  it("editor lens mentions acquisitions editor", () => {
    expect(REVIEW_PERSONAS["review-editor"].lens("x").toLowerCase()).toContain("acquisitions editor");
  });

  it("fan lens mentions reader", () => {
    expect(REVIEW_PERSONAS["review-fan"].lens("x").toLowerCase()).toContain("reader");
  });

  it("author lens mentions craft or prose", () => {
    const lens = REVIEW_PERSONAS["review-author"].lens("x").toLowerCase();
    expect(lens).toMatch(/craft|prose/);
  });

  it("comedy lens mentions comedy or joke", () => {
    expect(REVIEW_PERSONAS["review-comedy"].lens("x").toLowerCase()).toMatch(/comedy|joke/);
  });
});

describe("get_peer_review_prompts tool handler", () => {
  it("returns a text content block with all four personas serialized", () => {
    const display = Object.fromEntries(
      Object.entries(REVIEW_PERSONAS).map(([id, { mode, lens }]) => [
        id,
        { mode, lens: lens("your project") },
      ])
    );
    const result = { content: [{ type: "text", text: JSON.stringify(display, null, 2) }] };

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed["review-editor"]).toBeDefined();
    expect(parsed["review-fan"]).toBeDefined();
    expect(parsed["review-author"]).toBeDefined();
    expect(parsed["review-comedy"]).toBeDefined();
    expect(parsed["review-editor"].mode).toBe("Acquisitions Editor");
    expect(parsed["review-fan"].mode).toBe("Fan Reader");
    expect(parsed["review-author"].mode).toBe("Peer Author");
    expect(parsed["review-comedy"].mode).toBe("Comedy Writer");
    expect(typeof parsed["review-editor"].lens).toBe("string");
    expect(parsed["review-editor"].lens.length).toBeGreaterThan(0);
  });
});
