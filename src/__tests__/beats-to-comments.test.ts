// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { beatsToComments, commentsToBeats } from "@/components/editor/editor-config";

describe("beatsToComments", () => {
    it("stores a beat node as the canonical beat comment", () => {
        const html = '<p>Text</p><div data-type="beat-annotation">Action</div><p>More</p>';
        expect(beatsToComments(html)).toBe("<p>Text</p><!-- beat: Action --><p>More</p>");
    });

    it("round-trips through commentsToBeats unchanged", () => {
        const stored = "<p>Text</p><!-- beat: Action beat  --><p>More</p>";
        expect(beatsToComments(commentsToBeats(stored))).toBe(stored);
    });
});
