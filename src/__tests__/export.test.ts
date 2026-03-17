import { describe, it, expect } from "vitest";
import { stripBeatMarkers, htmlToPlainText } from "@/lib/export-json";

// Test the HTML-to-Markdown conversion logic used in export
function htmlToMarkdown(html: string): string {
  if (!html || html === "<p></p>") return "";

  let md = html;
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n");
  md = md.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i>(.*?)<\/i>/gi, "*$1*");
  md = md.replace(/<u>(.*?)<\/u>/gi, "$1");
  md = md.replace(/<ul[^>]*>/gi, "");
  md = md.replace(/<\/ul>/gi, "\n");
  md = md.replace(/<ol[^>]*>/gi, "");
  md = md.replace(/<\/ol>/gi, "\n");
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<[^>]+>/g, "");
  md = md.replace(/\n{3,}/g, "\n\n");
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&nbsp;/g, " ");

  return md.trim();
}

describe("HTML to Markdown conversion", () => {
  it("converts empty or minimal HTML", () => {
    expect(htmlToMarkdown("")).toBe("");
    expect(htmlToMarkdown("<p></p>")).toBe("");
  });

  it("converts paragraphs", () => {
    expect(htmlToMarkdown("<p>Hello world</p>")).toBe("Hello world");
    expect(htmlToMarkdown("<p>First</p><p>Second</p>")).toBe("First\n\nSecond");
  });

  it("converts bold and italic", () => {
    expect(htmlToMarkdown("<p><strong>bold</strong></p>")).toBe("**bold**");
    expect(htmlToMarkdown("<p><em>italic</em></p>")).toBe("*italic*");
    expect(htmlToMarkdown("<p><strong><em>both</em></strong></p>")).toBe("***both***");
  });

  it("converts headings", () => {
    expect(htmlToMarkdown("<h1>Title</h1>")).toBe("# Title");
    expect(htmlToMarkdown("<h2>Subtitle</h2>")).toBe("## Subtitle");
    expect(htmlToMarkdown("<h3>Section</h3>")).toBe("### Section");
  });

  it("converts lists", () => {
    const html = "<ul><li>One</li><li>Two</li><li>Three</li></ul>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("- One");
    expect(md).toContain("- Two");
    expect(md).toContain("- Three");
  });

  it("strips unknown tags", () => {
    expect(htmlToMarkdown("<p><span class='foo'>text</span></p>")).toBe("text");
  });

  it("decodes HTML entities", () => {
    expect(htmlToMarkdown("<p>A &amp; B</p>")).toBe("A & B");
    expect(htmlToMarkdown("<p>&lt;code&gt;</p>")).toBe("<code>");
  });

  it("handles complex content", () => {
    const html = `<h2>Chapter Title</h2><p>The <strong>brave</strong> knight entered the <em>dark</em> forest.</p><p>He carried with him:</p><ul><li>A sword</li><li>A shield</li></ul>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain("## Chapter Title");
    expect(md).toContain("**brave**");
    expect(md).toContain("*dark*");
    expect(md).toContain("- A sword");
    expect(md).toContain("- A shield");
  });
});

describe("stripBeatMarkers", () => {
  it("strips HTML comment beats", () => {
    const html = '<p>Hello</p><!-- beat: Action scene --><p>World</p>';
    expect(stripBeatMarkers(html)).toBe("<p>Hello</p><p>World</p>");
  });

  it("strips editor beat divs", () => {
    const html = '<p>Hello</p><div data-type="beat-annotation">Chase scene</div><p>World</p>';
    expect(stripBeatMarkers(html)).toBe("<p>Hello</p><p>World</p>");
  });

  it("strips multiple beats", () => {
    const html = '<!-- beat: First --><!-- beat: Second --><p>Content</p>';
    expect(stripBeatMarkers(html)).toBe("<p>Content</p>");
  });

  it("returns HTML unchanged when no beats present", () => {
    const html = "<p>No beats here</p>";
    expect(stripBeatMarkers(html)).toBe(html);
  });

  it("strips multiline beat comments", () => {
    const html = '<p>Before</p><!-- beat: This is\na multiline\nbeat --><p>After</p>';
    expect(stripBeatMarkers(html)).toBe("<p>Before</p><p>After</p>");
  });
});

describe("htmlToPlainText", () => {
  it("converts empty or minimal HTML", () => {
    expect(htmlToPlainText("")).toBe("");
    expect(htmlToPlainText("<p></p>")).toBe("");
  });

  it("converts paragraphs to plain text", () => {
    expect(htmlToPlainText("<p>Hello world</p>")).toBe("Hello world");
    expect(htmlToPlainText("<p>First</p><p>Second</p>")).toBe("First\n\nSecond");
  });

  it("strips formatting tags", () => {
    expect(htmlToPlainText("<p><strong>bold</strong> and <em>italic</em></p>")).toBe("bold and italic");
  });

  it("strips beat markers from plain text", () => {
    const html = '<p>Before beat</p><!-- beat: Action --><p>After beat</p>';
    const text = htmlToPlainText(html);
    expect(text).toBe("Before beat\n\nAfter beat");
    expect(text).not.toContain("beat:");
    expect(text).not.toContain("Action");
  });

  it("strips editor beat divs from plain text", () => {
    const html = '<p>Content</p><div data-type="beat-annotation">Chase</div><p>More</p>';
    const text = htmlToPlainText(html);
    expect(text).toBe("Content\n\nMore");
    expect(text).not.toContain("Chase");
  });

  it("decodes HTML entities", () => {
    expect(htmlToPlainText("<p>A &amp; B</p>")).toBe("A & B");
    expect(htmlToPlainText("<p>&ldquo;Hello&rdquo;</p>")).toBe("\u201CHello\u201D");
    expect(htmlToPlainText("<p>dash &mdash; here</p>")).toBe("dash \u2014 here");
  });

  it("handles line breaks", () => {
    expect(htmlToPlainText("<p>Line one<br>Line two</p>")).toBe("Line one\nLine two");
  });
});
