import { describe, it, expect } from "vitest";
import { commentsToBeats } from "@/components/editor/editor-config";

describe("commentsToBeats", () => {
    it("converts beat comments to div elements", () => {
        const html = '<p>Text</p><!-- beat: Action --><p>More</p>';
        expect(commentsToBeats(html)).toBe(
            '<p>Text</p><div data-type="beat-annotation">Action</div><p>More</p>'
        );
    });

    it("escapes HTML in beat content to prevent XSS", () => {
        const html = '<!-- beat: <script>alert(1)</script> -->';
        const result = commentsToBeats(html);
        expect(result).not.toContain("<script>");
        expect(result).toContain("&lt;script&gt;");
        expect(result).toContain("&lt;/script&gt;");
    });

    it("escapes angle brackets in beat content", () => {
        const html = '<!-- beat: <img src=x onerror=alert(1)> -->';
        const result = commentsToBeats(html);
        expect(result).not.toContain("<img");
        expect(result).toContain("&lt;img");
    });

    it("escapes quotes in beat content", () => {
        const html = '<!-- beat: "test" -->';
        const result = commentsToBeats(html);
        expect(result).toContain("&quot;test&quot;");
    });

    it("escapes ampersands in beat content", () => {
        const html = '<!-- beat: A & B -->';
        const result = commentsToBeats(html);
        expect(result).toContain("A &amp; B");
    });

    it("handles multiple beat comments with XSS payloads", () => {
        const html = '<!-- beat: <script>1</script> --><p>text</p><!-- beat: <img onerror=x> -->';
        const result = commentsToBeats(html);
        expect(result).not.toContain("<script>");
        expect(result).not.toContain("<img");
    });
});
