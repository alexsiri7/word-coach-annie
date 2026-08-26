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
        const writeSceneSection = mcpSource.slice(
            mcpSource.indexOf('"write_scene_content"'),
            mcpSource.indexOf('"write_scene_content"') + 2000
        );

        it("should NOT contain a hard guard that checks for CONTENT blocks", () => {
            expect(writeSceneSection).not.toContain('blocks.some(b => b.type === "CONTENT")');
        });

        it("should NOT return Annie's refusal message for CONTENT blocks", () => {
            expect(writeSceneSection).not.toContain("Oh no no no. That part is yours.");
        });

        it("should call writeSceneContentFromBlocks directly without a CONTENT guard", () => {
            expect(writeSceneSection).toContain("writeSceneContentFromBlocks");
            expect(writeSceneSection).not.toContain("if (hasContentBlock)");
        });

        it("should describe write_scene_content with BEAT-by-default, CONTENT-on-request semantics", () => {
            expect(writeSceneSection).toContain("BEAT blocks by default");
            expect(writeSceneSection).toContain("CONTENT blocks are permitted only when the author explicitly requests prose");
            expect(writeSceneSection).not.toContain("Annie should ONLY use 'blocks' with type BEAT — never produce CONTENT blocks");
        });
    });
});

describe("plan_beats prompt", () => {
    // Slice anchor: indexOf('"plan_beats"') finds the server.prompt("plan_beats", ...) declaration.
    // The string "plan_beats" only appears once in the file (as the prompt name), so this is safe.
    // Slice length of 3000 chars covers the full handler (~2000 chars); increase if handler grows.
    const planBeatsSection = mcpSource.slice(
        mcpSource.indexOf('"plan_beats"'),
        mcpSource.indexOf('"plan_beats"') + 3000
    );

    it("should register a plan_beats prompt", () => {
        expect(mcpSource).toContain('"plan_beats"');
    });

    it("should load the scene-drafting-assistant skill", () => {
        expect(planBeatsSection).toContain('loadSkill("scene-drafting-assistant")');
    });

    it("should prepend ANNIE_HARD_RULE in plan_beats prompt", () => {
        expect(planBeatsSection).toContain("ANNIE_HARD_RULE + contextHeader + skill.instructions");
    });

    it("should include scene status, chapter, and word count in context header", () => {
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

    it("update_paragraph handler should not destructure intent (semantic signal only)", () => {
        const handlerArgsMatch = updateParagraphSection.match(/async \(\{([^}]+)\}\)/);
        expect(handlerArgsMatch).not.toBeNull();
        expect(handlerArgsMatch![1]).not.toContain("intent");
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

describe("cross_reference_story_bible has no human approval gate", () => {
    it("should NOT instruct the model to wait for author confirmation", () => {
        expect(mcpSource).not.toContain("Never silently overwrite. Always ask before making changes.");
    });

    it("cross_reference_story_bible tool description should not mention confirmation flow", () => {
        expect(mcpSource).not.toContain("confirmation flow");
    });

    it("cross_reference_story_bible Step 3 should use indicative language, not ask-for-confirmation language", () => {
        expect(mcpSource).toContain("indicate which is the source of truth");
    });
});

describe("StaleWriteError handler-level wrapping", () => {
    const handlers = [
        "update_project",
        "update_node",
        "write_scene_content",
        "update_story_object",
        "update_universe",
        "update_world_object",
        "update_timeline_entry",
    ];

    it("mcpRun helper returns isError: true on failure", () => {
        // All handlers delegate to mcpRun, which centralises error handling.
        expect(mcpSource).toContain("isError: true");
        expect(mcpSource).toContain("logger.error");
    });

    for (const handler of handlers) {
        it(`${handler} delegates to mcpRun for error handling`, () => {
            const start = mcpSource.indexOf(`"${handler}"`);
            const section = mcpSource.slice(start, start + 2500);
            expect(section).toContain("mcpRun");
        });
    }

    it("write_scene_content throws missing-arg error inside mcpRun callback (returns isError)", () => {
        const start = mcpSource.indexOf('"write_scene_content"');
        const section = mcpSource.slice(start, start + 2000);
        const throwIdx = section.indexOf('throw new Error("Either');
        // The throw is inside an mcpRun async callback — mcpRun's own catch block
        // handles it and returns isError: true. Verify the throw exists and mcpRun wraps it.
        expect(throwIdx).toBeGreaterThan(-1);
        expect(section).toContain("mcpRun");
    });
});

describe("review persona prompts", () => {
    it("buildReviewPrompt helper should include ANNIE_HARD_RULE and export_manuscript", () => {
        const helperStart = mcpSource.indexOf("function buildReviewPrompt");
        expect(helperStart).toBeGreaterThan(-1);
        const helperSection = mcpSource.slice(helperStart, helperStart + 1000);
        expect(helperSection).toContain("ANNIE_HARD_RULE");
        expect(helperSection).toContain("export_manuscript");
    });

    for (const promptName of ["review-editor", "review-fan", "review-author", "review-comedy", "review-actor"]) {
        describe(`${promptName} prompt`, () => {
            it(`should register the ${promptName} prompt`, () => {
                expect(mcpSource).toContain(`"${promptName}"`);
            });

            it(`should call buildReviewPrompt in ${promptName}`, () => {
                const start = mcpSource.indexOf(`"${promptName}"`);
                const section = mcpSource.slice(start, start + 3000);
                expect(section).toContain("buildReviewPrompt");
            });
        });
    }
});

describe("mcpRun StaleWriteError logging", () => {
    it("imports StaleWriteError from @/mcp/content-hash", () => {
        expect(mcpSource).toContain('import { StaleWriteError } from "@/mcp/content-hash"');
    });

    it("uses logger.warn (not logger.error) for StaleWriteError", () => {
        const catchIdx = mcpSource.indexOf("} catch (e) {");
        const catchBlock = mcpSource.slice(catchIdx, catchIdx + 400);
        expect(catchBlock).toContain("e instanceof StaleWriteError");
        expect(catchBlock).toContain("logger.warn(");
        // Ensure the else branch still calls logger.error for non-stale errors
        expect(catchBlock).toContain("logger.error(");
    });

    it("returns isError: true for both StaleWriteError and generic errors", () => {
        const catchIdx = mcpSource.indexOf("} catch (e) {");
        const catchBlock = mcpSource.slice(catchIdx, catchIdx + 400);
        expect(catchBlock).toContain("isError: true");
    });
});

describe("run_peer_review and get_peer_reviews tools", () => {
    const runSection = mcpSource.slice(
        mcpSource.indexOf('"run_peer_review"'),
        mcpSource.indexOf('"run_peer_review"') + 1000
    );
    const getSection = mcpSource.slice(
        mcpSource.indexOf('"get_peer_reviews"'),
        mcpSource.indexOf('"get_peer_reviews"') + 1500
    );

    it("run_peer_review delegates error handling to mcpRun", () => {
        expect(runSection).toContain("mcpRun");
    });

    it("run_peer_review passes an error prefix to mcpRun", () => {
        expect(runSection).toContain("Error running peer review");
    });

    it("get_peer_reviews clamps limit with Math.min(Math.max(...))", () => {
        expect(getSection).toContain("Math.min(Math.max(limit");
    });

    it("get_peer_reviews returns isError: true on failure", () => {
        expect(getSection).toContain("isError: true");
    });

    it("get_peer_reviews limit description mentions max 20", () => {
        expect(getSection).toContain("max 20");
    });
});
