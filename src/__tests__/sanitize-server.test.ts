import { describe, it, expect } from "vitest";
import { sanitizeInput, sanitizeHtml, escapeMarkdown } from "@/lib/sanitize-server";

describe("sanitizeInput", () => {
    it("strips HTML tags from input", () => {
        expect(sanitizeInput("<b>bold</b>")).toBe("bold");
        expect(sanitizeInput("plain text")).toBe("plain text");
    });

    it("strips script tags and their content", () => {
        expect(sanitizeInput("<script>alert('xss')</script>")).toBe("");
    });

    it("handles empty string", () => {
        expect(sanitizeInput("")).toBe("");
    });
});

describe("sanitizeHtml", () => {
    it("preserves safe formatting tags", () => {
        expect(sanitizeHtml("<b>bold</b>")).toBe("<b>bold</b>");
        expect(sanitizeHtml("<a href=\"https://example.com\">link</a>")).toBe(
            "<a href=\"https://example.com\">link</a>"
        );
    });

    it("strips script tags and content", () => {
        expect(sanitizeHtml("<script>alert('xss')</script>")).toBe("");
    });

    it("strips event handlers from elements", () => {
        expect(sanitizeHtml("<img src=\"x\" onerror=\"alert(1)\">")).toBe("<img src=\"x\">");
    });

    it("passes through plain text", () => {
        expect(sanitizeHtml("plain text")).toBe("plain text");
    });

    it("preserves beat comments (would otherwise be stripped by DOMPurify)", () => {
        const input = "<p>Text</p><!-- beat: Action --><p>More text</p>";
        expect(sanitizeHtml(input)).toBe("<p>Text</p><!-- beat: Action --><p>More text</p>");
    });

    it("preserves multiple beat comments", () => {
        const input = "<p>A</p><!-- beat: First --><!-- beat: Second --><p>B</p>";
        expect(sanitizeHtml(input)).toBe("<p>A</p><!-- beat: First --><!-- beat: Second --><p>B</p>");
    });

    it("still strips XSS while preserving beat comments", () => {
        const input = '<p>Text</p><!-- beat: Action --><script>alert(1)</script>';
        const result = sanitizeHtml(input);
        expect(result).toContain("<!-- beat: Action -->");
        expect(result).not.toContain("<script>");
    });
});

describe("escapeMarkdown", () => {
    it("escapes HTML entities", () => {
        expect(escapeMarkdown("<script>")).toBe("&lt;script&gt;");
        expect(escapeMarkdown("a & b")).toBe("a &amp; b");
    });

    it("escapes markdown link syntax", () => {
        expect(escapeMarkdown("[click](https://evil.com)")).toBe(
            "\\[click\\]\\(https://evil.com\\)"
        );
    });

    it("escapes markdown image and code syntax", () => {
        expect(escapeMarkdown("!image")).toBe("\\!image");
        expect(escapeMarkdown("`code`")).toBe("\\`code\\`");
    });

    it("passes through safe plain text", () => {
        expect(escapeMarkdown("hello world")).toBe("hello world");
    });

    it("escapes backslash", () => {
        expect(escapeMarkdown("a\\b")).toBe("a\\\\b");
    });

    it("escapes asterisk", () => {
        expect(escapeMarkdown("*bold*")).toBe("\\*bold\\*");
    });

    it("escapes underscore", () => {
        expect(escapeMarkdown("_italic_")).toBe("\\_italic\\_");
    });

    it("escapes tilde", () => {
        expect(escapeMarkdown("~strike~")).toBe("\\~strike\\~");
    });

    it("escapes hash", () => {
        expect(escapeMarkdown("# heading")).toBe("\\# heading");
    });

    it("escapes pipe", () => {
        expect(escapeMarkdown("a | b")).toBe("a \\| b");
    });
});
