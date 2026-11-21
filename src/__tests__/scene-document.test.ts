import { describe, it, expect } from "vitest";
import type { SceneBlock } from "@/lib/types";
import {
    deleteBeatAt,
    flattenToParagraphs,
    insertBeatAfter,
    paragraphHash,
    parseSceneContent,
    replaceParagraph,
    serializeSceneContent,
    validateSceneContent,
} from "@/lib/scene-document";
import { computeContentHash } from "@/lib/content-hash";

const scene: SceneBlock[] = [
    { type: "BEAT", content: "Opening beat" },
    { type: "CONTENT", content: "<p>One</p>\n<p class=\"x\">Two\nlines</p>" },
    { type: "CONTENT", content: "raw text" },
];

function frozen(blocks: SceneBlock[]): SceneBlock[] {
    return Object.freeze(blocks.map((b) => Object.freeze({ ...b }))) as SceneBlock[];
}

describe("scene-document", () => {
    describe("parse and serialize", () => {
        it("round-trips canonical content", () => {
            const content = "<p>A</p><!-- beat: Turn --><p>B</p>";
            expect(parseSceneContent(content)).toEqual([
                { type: "CONTENT", content: "<p>A</p>" },
                { type: "BEAT", content: "Turn" },
                { type: "CONTENT", content: "<p>B</p>" },
            ]);
            expect(serializeSceneContent(parseSceneContent(content))).toBe(content);
        });

        it("trims whitespace and newlines around beat text", () => {
            expect(parseSceneContent("<!-- beat:\n  Turn \n-->")).toEqual([{ type: "BEAT", content: "Turn" }]);
        });
    });

    describe("validateSceneContent", () => {
        it("accepts well-formed beats", () => {
            expect(() => validateSceneContent("<p>A</p><!-- beat: ok -->")).not.toThrow();
        });

        it("rejects an unclosed beat", () => {
            expect(() => validateSceneContent("<!-- beat: open")).toThrow(
                "Malformed scene content: Unclosed beat annotation found."
            );
        });

        it("rejects a nested comment", () => {
            expect(() => validateSceneContent("<!-- beat: a <!-- b -->")).toThrow(
                "Malformed scene content: Nested comments in beats are not allowed."
            );
        });
    });

    describe("flattenToParagraphs", () => {
        it("numbers beats, each <p>, and <p>-less blocks as paragraphs", () => {
            expect(flattenToParagraphs(scene)).toEqual([
                { index: 0, blockIndex: 0, positionWithinBlock: 0, type: "BEAT", content: "Opening beat" },
                { index: 1, blockIndex: 1, positionWithinBlock: 0, type: "CONTENT", content: "<p>One</p>" },
                { index: 2, blockIndex: 1, positionWithinBlock: 1, type: "CONTENT", content: "<p class=\"x\">Two\nlines</p>" },
                { index: 3, blockIndex: 2, positionWithinBlock: 0, type: "CONTENT", content: "raw text" },
            ]);
        });

        it("hashes a paragraph over its index, type and content", () => {
            const [beat] = flattenToParagraphs(scene);
            expect(paragraphHash(beat)).toBe(computeContentHash("0", "BEAT", "Opening beat"));
        });
    });

    describe("insertBeatAfter", () => {
        const blocks: SceneBlock[] = [{ type: "CONTENT", content: "<p>P1</p><p>P2</p><p>P3</p>" }];

        it("inserts at the very beginning for -1", () => {
            expect(insertBeatAfter(blocks, -1, "First")).toEqual([{ type: "BEAT", content: "First" }, ...blocks]);
        });

        it("splits a block when inserting mid-block", () => {
            expect(insertBeatAfter(blocks, 0, "Mid")).toEqual([
                { type: "CONTENT", content: "<p>P1</p>" },
                { type: "BEAT", content: "Mid" },
                { type: "CONTENT", content: "<p>P2</p><p>P3</p>" },
            ]);
        });

        it("does not split when inserting after a block's last paragraph", () => {
            expect(insertBeatAfter(blocks, 2, "End")).toEqual([...blocks, { type: "BEAT", content: "End" }]);
        });

        it("drops a whitespace-only remainder when splitting", () => {
            expect(insertBeatAfter([{ type: "CONTENT", content: "<p>P1</p><p>P2</p>\n" }], 1, "End")).toEqual([
                { type: "CONTENT", content: "<p>P1</p><p>P2</p>\n" },
                { type: "BEAT", content: "End" },
            ]);
        });

        it("inserts after a beat without splitting", () => {
            expect(insertBeatAfter(scene, 0, "Second")).toEqual([scene[0], { type: "BEAT", content: "Second" }, scene[1], scene[2]]);
        });

        it("rejects an out-of-range index", () => {
            expect(() => insertBeatAfter(blocks, 3, "Bad")).toThrow("afterParagraphIndex 3 out of range (-1–2)");
            expect(() => insertBeatAfter(blocks, -2, "Bad")).toThrow("afterParagraphIndex -2 out of range (-1–2)");
        });

        it("does not mutate its input", () => {
            const input = frozen(scene);
            expect(() => insertBeatAfter(input, 1, "Mid")).not.toThrow();
            expect(input).toEqual(scene);
        });
    });

    describe("replaceParagraph", () => {
        it("replaces a beat", () => {
            expect(replaceParagraph(scene, 0, "New beat")[0]).toEqual({ type: "BEAT", content: "New beat" });
        });

        it("replaces a single-paragraph block whole", () => {
            expect(replaceParagraph(scene, 3, "<p>Cooked</p>")[2]).toEqual({ type: "CONTENT", content: "<p>Cooked</p>" });
        });

        it("replaces one <p> of a multi-paragraph block, keeping what follows it", () => {
            const blocks: SceneBlock[] = [{ type: "CONTENT", content: "<p>A</p><p>B</p>\n<p>C</p>" }];
            expect(replaceParagraph(blocks, 1, "<p>X</p>")).toEqual([
                { type: "CONTENT", content: "<p>A</p><p>X</p>\n<p>C</p>" },
            ]);
        });

        it("rejects an out-of-range index", () => {
            expect(() => replaceParagraph(scene, 4, "x")).toThrow("Paragraph index 4 out of range (0–3)");
        });

        it("does not mutate its input", () => {
            const input = frozen(scene);
            expect(() => replaceParagraph(input, 2, "<p>X</p>")).not.toThrow();
            expect(input).toEqual(scene);
        });
    });

    describe("deleteBeatAt", () => {
        it("removes a beat", () => {
            expect(deleteBeatAt(scene, 0)).toEqual([scene[1], scene[2]]);
        });

        it("refuses to delete prose", () => {
            expect(() => deleteBeatAt(scene, 1)).toThrow(
                "Paragraph 1 is prose, not a beat — delete_beat only removes beats"
            );
        });

        it("rejects an out-of-range index", () => {
            expect(() => deleteBeatAt(scene, -1)).toThrow("Paragraph index -1 out of range (0–3)");
        });
    });
});
