import { describe, it, expect } from "vitest";
import { parseContent, stripHtml } from "@/components/conflict-resolver-modal";

describe("parseContent", () => {
  it("returns placeholder for null", () => {
    expect(parseContent(null)).toBe("(no content)");
  });

  it("returns placeholder for undefined", () => {
    expect(parseContent(undefined)).toBe("(no content)");
  });

  it("returns placeholder for empty string", () => {
    expect(parseContent("")).toBe("(no content)");
  });

  it("extracts .content from JSON string", () => {
    expect(parseContent('{"content":"hello world"}')).toBe("hello world");
  });

  it("returns JSON.stringify for JSON without .content string", () => {
    const input = '{"title":"foo"}';
    const result = parseContent(input);
    expect(result).toContain("foo");
  });

  it("returns raw string for non-JSON input", () => {
    expect(parseContent("plain text")).toBe("plain text");
  });
});

describe("stripHtml", () => {
  it("removes HTML tags", () => {
    expect(stripHtml("<p>Hello</p>")).toBe("Hello");
  });

  it("collapses whitespace", () => {
    expect(stripHtml("<p>Hello</p>   <p>World</p>")).toBe("Hello World");
  });

  it("trims leading and trailing whitespace", () => {
    expect(stripHtml("  <b>text</b>  ")).toBe("text");
  });

  it("returns empty string for empty input", () => {
    expect(stripHtml("")).toBe("");
  });

  it("returns plain text unchanged (no tags)", () => {
    expect(stripHtml("hello world")).toBe("hello world");
  });
});
