import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { ANNIE_HARD_RULE, CLAUDE_COLLABORATION_INSTRUCTIONS } from "../mcp/annie-voice";

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

    describe("write_scene_content allows CONTENT blocks (author in control)", () => {
        it("should NOT contain a hard guard that checks for CONTENT blocks", () => {
            const writeSceneSection = mcpSource.slice(
                mcpSource.indexOf('"write_scene_content"'),
                mcpSource.indexOf('"write_scene_content"') + 2000
            );
            expect(writeSceneSection).not.toContain('blocks.some(b => b.type === "CONTENT")');
        });

        it("should NOT return Annie's refusal message for CONTENT blocks", () => {
            const writeSceneSection = mcpSource.slice(
                mcpSource.indexOf('"write_scene_content"'),
                mcpSource.indexOf('"write_scene_content"') + 2000
            );
            expect(writeSceneSection).not.toContain("Oh no no no. That part is yours.");
        });

        it("should call writeSceneContentFromBlocks directly without a CONTENT guard", () => {
            const writeSceneSection = mcpSource.slice(
                mcpSource.indexOf('"write_scene_content"'),
                mcpSource.indexOf('"write_scene_content"') + 2000
            );
            expect(writeSceneSection).toContain("writeSceneContentFromBlocks");
            expect(writeSceneSection).not.toContain("if (hasContentBlock)");
        });

        it("should describe write_scene_content with BEAT-by-default, CONTENT-on-request semantics", () => {
            const toolDescSection = mcpSource.slice(
                mcpSource.indexOf('"write_scene_content"'),
                mcpSource.indexOf('"write_scene_content"') + 500
            );
            expect(toolDescSection).toContain("BEAT blocks by default");
            expect(toolDescSection).toContain("CONTENT blocks are permitted only when the author explicitly requests prose");
            expect(toolDescSection).not.toContain("Annie should ONLY use 'blocks' with type BEAT — never produce CONTENT blocks");
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

describe("CLAUDE_COLLABORATION_INSTRUCTIONS content", () => {
    it("should identify Claude as a structural collaborator", () => {
        expect(CLAUDE_COLLABORATION_INSTRUCTIONS).toContain("structural collaborator");
        expect(CLAUDE_COLLABORATION_INSTRUCTIONS).toContain("prose belongs to the writer");
    });

    it("should default to BEAT blocks in write_scene_content instructions", () => {
        expect(CLAUDE_COLLABORATION_INSTRUCTIONS).toContain("write_scene_content");
        expect(CLAUDE_COLLABORATION_INSTRUCTIONS).toContain("BEAT");
    });

    it("should permit CONTENT blocks when the author explicitly requests prose", () => {
        expect(CLAUDE_COLLABORATION_INSTRUCTIONS).toContain(
            "use CONTENT blocks only when the author explicitly asks you to write prose"
        );
        expect(CLAUDE_COLLABORATION_INSTRUCTIONS).not.toContain("never CONTENT blocks");
    });

    it("should include stale-write protection guidance", () => {
        expect(CLAUDE_COLLABORATION_INSTRUCTIONS).toContain("paragraphContentHash");
    });
});

describe("update_paragraph intent field", () => {
    const updateParagraphSection = mcpSource.slice(
        mcpSource.indexOf('"update_paragraph"'),
        mcpSource.indexOf('"update_paragraph"') + 1500
    );

    it("should include intent enum in the update_paragraph schema", () => {
        expect(updateParagraphSection).toContain("intent");
        expect(updateParagraphSection).toContain("editorial");
        expect(updateParagraphSection).toContain("creative");
    });

    it("should describe the prose-writing guard exemption in the intent field description", () => {
        expect(updateParagraphSection).toContain("prose-writing guard does not apply");
    });

    it("ANNIE_HARD_RULE should contain editorial intent exemption", () => {
        expect(ANNIE_HARD_RULE).toContain("intent: 'editorial'");
        expect(ANNIE_HARD_RULE).toContain("editorial intent");
    });

    it("CLAUDE_COLLABORATION_INSTRUCTIONS should mention intent: 'editorial' for editorial corrections", () => {
        expect(CLAUDE_COLLABORATION_INSTRUCTIONS).toContain('intent: "editorial"');
    });
});

describe("get_initial_instructions tool registration", () => {
    it("should register get_initial_instructions in index.ts", () => {
        expect(mcpSource).toContain('"get_initial_instructions"');
    });

    it("should return CLAUDE_COLLABORATION_INSTRUCTIONS as text", () => {
        const toolSection = mcpSource.slice(
            mcpSource.indexOf('"get_initial_instructions"'),
            mcpSource.indexOf('"get_initial_instructions"') + 500
        );
        expect(toolSection).toContain("CLAUDE_COLLABORATION_INSTRUCTIONS");
        expect(toolSection).toContain('type: "text"');
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
