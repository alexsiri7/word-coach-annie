// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { sanitizeMessageContent } from "@/lib/sanitize";

describe("sanitizeMessageContent", () => {
  it("strips <script> tags", () => {
    expect(sanitizeMessageContent("<script>alert(1)</script>")).toBe("");
  });

  it("strips <img onerror> tags", () => {
    const result = sanitizeMessageContent('<img onerror="alert(1)">');
    expect(result).not.toContain("onerror");
    expect(result).not.toContain("<img");
  });

  it("strips javascript: hrefs from <a> tags", () => {
    const result = sanitizeMessageContent('<a href="javascript:void(0)">click</a>');
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("<a");
    expect(result).toContain("click");
  });

  it("strips nested script tags inside divs", () => {
    const result = sanitizeMessageContent("<div><script>x</script></div>");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("<div>");
  });

  it("passes normal text through unchanged", () => {
    expect(sanitizeMessageContent("Hello, world!")).toBe("Hello, world!");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeMessageContent("")).toBe("");
  });

  it("preserves HTML entities in text", () => {
    expect(sanitizeMessageContent("&amp;")).toBe("&amp;");
  });

  it("preserves markdown-like content", () => {
    const md = "**bold** and `code` and *italic*";
    expect(sanitizeMessageContent(md)).toBe(md);
  });
});
