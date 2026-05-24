import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const mcpSource = readFileSync(resolve(__dirname, "../mcp/index.ts"), "utf-8");

describe("Annie Hard Rule Enforcement", () => {
    describe("review prompt includes ANNIE_HARD_RULE", () => {
        it("should prepend ANNIE_HARD_RULE in the review prompt text property", () => {
            // The review prompt's text field must start with ANNIE_HARD_RULE
            // Look for the pattern: text: ANNIE_HARD_RULE + contextHeader + skill.instructions
            // in the review prompt section (spans ~45 lines from "review" declaration)
            const reviewStart = mcpSource.indexOf('"review"');
            const reviewPromptSection = mcpSource.slice(reviewStart, reviewStart + 5000);
            expect(reviewPromptSection).toContain("ANNIE_HARD_RULE + contextHeader + skill.instructions");
        });
    });

    describe("ANNIE_HARD_RULE content", () => {
        it("should contain the no-prose hard rule text", () => {
            expect(mcpSource).toContain("Hard Rule: No Prose");
            expect(mcpSource).toContain("You NEVER write narrative prose");
        });
    });

    describe("write_scene_content rejects CONTENT blocks", () => {
        it("should contain a guard that checks for CONTENT blocks", () => {
            const writeSceneSection = mcpSource.slice(
                mcpSource.indexOf('"write_scene_content"'),
                mcpSource.indexOf('"write_scene_content"') + 2000
            );
            expect(writeSceneSection).toContain('blocks.some(b => b.type === "CONTENT")');
        });

        it("should return Annie's refusal message for CONTENT blocks", () => {
            const writeSceneSection = mcpSource.slice(
                mcpSource.indexOf('"write_scene_content"'),
                mcpSource.indexOf('"write_scene_content"') + 2000
            );
            expect(writeSceneSection).toContain("Oh no no no. That part is yours.");
        });

        it("writeSceneContentFromBlocks call should remain after the CONTENT guard", () => {
            const writeSceneSection = mcpSource.slice(
                mcpSource.indexOf('"write_scene_content"'),
                mcpSource.indexOf('"write_scene_content"') + 2000
            );
            // After the guard, the normal writeSceneContentFromBlocks call remains
            expect(writeSceneSection).toContain("writeSceneContentFromBlocks");
            // Guard must branch on hasContentBlock being truthy, not falsy
            expect(writeSceneSection).toContain("if (hasContentBlock)");
            expect(writeSceneSection).not.toContain("if (!hasContentBlock)");
        });
    });
});
