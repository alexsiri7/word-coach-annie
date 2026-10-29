import { describe, it, expect } from "vitest";
import { htmlToMarkdown } from "@/lib/html-to-markdown";

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

  it("decodes an escaped entity only once", () => {
    expect(htmlToMarkdown("<p>&amp;lt;b&amp;gt; and &amp;amp;</p>")).toBe("&lt;b&gt; and &amp;");
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

  it("strips beats in both storage forms, including multi-line ones", () => {
    const html =
      '<p>Kept</p><!-- beat: comment beat >\nspanning lines --><div data-type="beat-annotation">div beat</div>';
    expect(htmlToMarkdown(html)).toBe("Kept");
  });

  it("keeps beat-annotation div text when asked to include beats", () => {
    expect(htmlToMarkdown('<div data-type="beat-annotation">div beat</div>', { includeBeats: true })).toBe("div beat");
  });
});
