import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { ANNIE_HARD_RULE } from "../mcp/annie-voice";

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
            expect(ANNIE_HARD_RULE).toContain("Hard Rule: No Prose");
            expect(ANNIE_HARD_RULE).toContain("You NEVER write narrative prose");
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

describe("plan_beats prompt", () => {
    // Slice anchor: indexOf('"plan_beats"') finds the server.prompt("plan_beats", ...) declaration.
    // The string "plan_beats" only appears once in the file (as the prompt name), so this is safe.
    // Slice length of 3000 chars covers the full handler (~2000 chars); increase if handler grows.
    it("should register a plan_beats prompt", () => {
        expect(mcpSource).toContain('"plan_beats"');
    });

    it("should load the scene-drafting-assistant skill", () => {
        const planBeatsSection = mcpSource.slice(
            mcpSource.indexOf('"plan_beats"'),
            mcpSource.indexOf('"plan_beats"') + 3000
        );
        expect(planBeatsSection).toContain('loadSkill("scene-drafting-assistant")');
    });

    it("should prepend ANNIE_HARD_RULE in plan_beats prompt", () => {
        const planBeatsSection = mcpSource.slice(
            mcpSource.indexOf('"plan_beats"'),
            mcpSource.indexOf('"plan_beats"') + 3000
        );
        expect(planBeatsSection).toContain("ANNIE_HARD_RULE + contextHeader + skill.instructions");
    });

    it("should include scene status, chapter, and word count in context header", () => {
        const planBeatsSection = mcpSource.slice(
            mcpSource.indexOf('"plan_beats"'),
            mcpSource.indexOf('"plan_beats"') + 3000
        );
        expect(planBeatsSection).toContain("Status:");
        expect(planBeatsSection).toContain("Chapter:");
        expect(planBeatsSection).toContain("Word Count:");
    });
});

describe("review persona prompts", () => {
    for (const promptName of ["review-editor", "review-fan", "review-author"]) {
        describe(`${promptName} prompt`, () => {
            it(`should register the ${promptName} prompt`, () => {
                expect(mcpSource).toContain(`"${promptName}"`);
            });

            it(`should instruct use of export_manuscript tool in ${promptName}`, () => {
                const start = mcpSource.indexOf(`"${promptName}"`);
                const section = mcpSource.slice(start, start + 3000);
                expect(section).toContain("export_manuscript");
            });

            it(`should prepend ANNIE_HARD_RULE in ${promptName} prompt`, () => {
                const start = mcpSource.indexOf(`"${promptName}"`);
                const section = mcpSource.slice(start, start + 3000);
                expect(section).toContain("ANNIE_HARD_RULE");
            });
        });
    }
});
