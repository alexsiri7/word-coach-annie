import { describe, it, expect } from "vitest";
import {
  parseAnnotationRange,
  isTextQuoteRange,
  resolveTextQuote,
  resolveAnnotationRanges,
} from "@/lib/annotation-anchoring";

describe("parseAnnotationRange / isTextQuoteRange", () => {
  it("parses a textQuote range and identifies it as such", () => {
    const range = JSON.stringify({ type: "textQuote", selectedText: "hello", prefix: "say ", suffix: "!" });
    const parsed = parseAnnotationRange(range);
    expect(isTextQuoteRange(parsed)).toBe(true);
  });

  it("does not misidentify a ProseMirror {from,to} range as a text quote", () => {
    const range = JSON.stringify({ from: 3, to: 10 });
    const parsed = parseAnnotationRange(range);
    expect(isTextQuoteRange(parsed)).toBe(false);
  });

  it("returns null for missing or unparsable range", () => {
    expect(parseAnnotationRange(null)).toBeNull();
    expect(parseAnnotationRange(undefined)).toBeNull();
    expect(parseAnnotationRange("not json")).toBeNull();
  });
});

describe("resolveTextQuote", () => {
  it("finds a unique quote with no context needed", () => {
    const result = resolveTextQuote("The quick brown fox jumps.", { quote: "brown fox" });
    expect(result).toEqual({ start: 10, end: 19 });
  });

  it("disambiguates a repeated quote using prefix", () => {
    const fullText = "The cat sat. The cat ran.";
    // "The cat" appears twice — prefix picks the second occurrence.
    const result = resolveTextQuote(fullText, { quote: "The cat", prefix: "sat. " });
    expect(result).not.toBeNull();
    expect(fullText.slice(result!.start, result!.end)).toBe("The cat");
    expect(result!.start).toBe(13);
  });

  it("disambiguates using suffix when prefix alone doesn't match", () => {
    const fullText = "AAA-BBB-AAA-CCC";
    const result = resolveTextQuote(fullText, { quote: "AAA", suffix: "-CCC" });
    expect(result).toEqual({ start: 8, end: 11 });
  });

  it("falls back to a bare match when prefix/suffix context no longer matches", () => {
    const fullText = "hello world";
    const result = resolveTextQuote(fullText, { quote: "world", prefix: "xyz " });
    expect(result).toEqual({ start: 6, end: 11 });
  });

  it("returns null when the quote no longer exists in the text", () => {
    const result = resolveTextQuote("hello world", { quote: "goodbye" });
    expect(result).toBeNull();
  });

  it("returns null for an empty quote", () => {
    const result = resolveTextQuote("hello world", { quote: "" });
    expect(result).toBeNull();
  });
});

describe("resolveAnnotationRanges", () => {
  // Regression test for the "one highlight breaks the others" bug: multiple
  // annotations resolved against the SAME flattened text must all resolve
  // correctly and independently, in a single pass, with none of them
  // depending on another annotation's match having (or not having) been
  // found first.
  it("resolves multiple non-overlapping annotations independently in one pass", () => {
    const fullText = "The quick brown fox jumps over the lazy dog.";
    const annotations = [
      { id: "a1", range: null, selectedText: "quick brown fox" },
      { id: "a2", range: null, selectedText: "lazy dog" },
      { id: "a3", range: null, selectedText: "jumps over" },
    ];

    const resolved = resolveAnnotationRanges(fullText, annotations);
    const byId = new Map(resolved.map((r) => [r.id, r]));

    expect(byId.size).toBe(3);
    expect(fullText.slice(byId.get("a1")!.start, byId.get("a1")!.end)).toBe("quick brown fox");
    expect(fullText.slice(byId.get("a2")!.start, byId.get("a2")!.end)).toBe("lazy dog");
    expect(fullText.slice(byId.get("a3")!.start, byId.get("a3")!.end)).toBe("jumps over");
  });

  it("resolves annotations regardless of the order they're passed in", () => {
    const fullText = "one two three four five";
    const forward = resolveAnnotationRanges(fullText, [
      { id: "first", range: null, selectedText: "one" },
      { id: "second", range: null, selectedText: "five" },
    ]);
    const reversed = resolveAnnotationRanges(fullText, [
      { id: "second", range: null, selectedText: "five" },
      { id: "first", range: null, selectedText: "one" },
    ]);

    const forwardById = new Map(forward.map((r) => [r.id, r]));
    const reversedById = new Map(reversed.map((r) => [r.id, r]));
    expect(forwardById.get("first")).toEqual(reversedById.get("first"));
    expect(forwardById.get("second")).toEqual(reversedById.get("second"));
  });

  it("returns results sorted by descending start offset, for safe DOM/doc application order", () => {
    const fullText = "aaa bbb ccc ddd";
    const resolved = resolveAnnotationRanges(fullText, [
      { id: "early", range: null, selectedText: "aaa" },
      { id: "late", range: null, selectedText: "ddd" },
      { id: "middle", range: null, selectedText: "ccc" },
    ]);
    expect(resolved.map((r) => r.id)).toEqual(["late", "middle", "early"]);
  });

  it("uses each annotation's own textQuote prefix/suffix to disambiguate repeated text", () => {
    const fullText = "Chapter one begins. Chapter two begins.";
    const annotations = [
      {
        id: "first-chapter",
        range: JSON.stringify({ type: "textQuote", selectedText: "Chapter", prefix: "", suffix: " one" }),
        selectedText: "Chapter",
      },
      {
        id: "second-chapter",
        range: JSON.stringify({ type: "textQuote", selectedText: "Chapter", prefix: ". ", suffix: " two" }),
        selectedText: "Chapter",
      },
    ];
    const resolved = resolveAnnotationRanges(fullText, annotations);
    const byId = new Map(resolved.map((r) => [r.id, r]));
    expect(byId.get("first-chapter")!.start).toBe(0);
    expect(byId.get("second-chapter")!.start).toBe(fullText.indexOf("Chapter two"));
  });

  it("skips annotations with no selectedText and annotations whose quote can't be found", () => {
    const fullText = "hello world";
    const resolved = resolveAnnotationRanges(fullText, [
      { id: "no-text", range: null, selectedText: null },
      { id: "not-found", range: null, selectedText: "goodbye" },
      { id: "found", range: null, selectedText: "hello" },
    ]);
    expect(resolved.map((r) => r.id)).toEqual(["found"]);
  });
});
