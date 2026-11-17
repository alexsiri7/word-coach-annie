import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { z } from "zod";
import { ANNIE_HARD_RULE, CLAUDE_COLLABORATION_INSTRUCTIONS } from "../lib/ai/annie-voice";
import { writeSceneContentSpec, updateParagraphSpec } from "../lib/ai/tool-catalog/structure";
import { getPeerReviewsSpec } from "../lib/ai/tool-catalog/peer-review";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf-8");
const readDir = (dir: string) =>
    readdirSync(resolve(__dirname, dir)).map((name) => read(`${dir}/${name}`)).join("\n");

const promptsSource = read("../mcp/register/prompts.ts");
const registerSources: Record<string, string> = {
    projects: read("../mcp/register/projects.ts"),
    structure: read("../mcp/register/structure.ts"),
    storyObjects: read("../mcp/register/story-objects.ts"),
    universes: read("../mcp/register/universes.ts"),
    skills: read("../mcp/register/skills.ts"),
};
/** Every file that defines or registers an MCP tool or prompt. */
const allMcpSource = [read("../mcp/index.ts"), readDir("../mcp/register"), readDir("../lib/ai/tool-catalog")].join("\n");

/** The source of one `registerTool(ctx, <spec>, handler)` call, up to the next registration. */
function handlerSection(source: string, specName: string): string {
    const start = source.indexOf(`registerTool(ctx, ${specName},`);
    expect(start).toBeGreaterThan(-1);
    const next = source.indexOf("registerTool(ctx,", start + 1);
    return source.slice(start, next === -1 ? undefined : next);
}

const schemaText = (spec: { parameters: z.ZodType }) => JSON.stringify(z.toJSONSchema(spec.parameters));

describe("Annie Hard Rule Enforcement", () => {
    describe("review prompt includes ANNIE_HARD_RULE", () => {
        it("should prepend ANNIE_HARD_RULE in the review prompt text property", () => {
            // The review prompt's text field must start with ANNIE_HARD_RULE
            // Look for the pattern: text: ANNIE_HARD_RULE + contextHeader + skill.instructions
            // in the review prompt section (spans ~45 lines from "review" declaration)
            const reviewStart = promptsSource.indexOf('"review"');
            const reviewPromptSection = promptsSource.slice(reviewStart, reviewStart + 5000);
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
        const writeSceneSection = handlerSection(registerSources.structure, "writeSceneContentSpec");

        it("should NOT contain a hard guard that checks for CONTENT blocks", () => {
            expect(writeSceneSection).not.toContain('blocks.some(b => b.type === "CONTENT")');
        });

        it("should NOT return Annie's refusal message for CONTENT blocks", () => {
            expect(writeSceneSection).not.toContain("Oh no no no. That part is yours.");
            expect(writeSceneContentSpec.description).not.toContain("Oh no no no. That part is yours.");
        });

        it("should call writeSceneContentFromBlocks directly without a CONTENT guard", () => {
            expect(writeSceneSection).toContain("writeSceneContentFromBlocks");
            expect(writeSceneSection).not.toContain("if (hasContentBlock)");
        });

        it("should describe write_scene_content with BEAT-by-default, CONTENT-on-request semantics", () => {
            expect(writeSceneContentSpec.description).toContain("BEAT blocks by default");
            expect(writeSceneContentSpec.description).toContain("CONTENT blocks are permitted only when the author explicitly requests prose");
            expect(writeSceneContentSpec.description).not.toContain("Annie should ONLY use 'blocks' with type BEAT — never produce CONTENT blocks");
        });
    });
});

describe("plan_beats prompt", () => {
    // Slice anchor: indexOf('"plan_beats"') finds the server.prompt("plan_beats", ...) declaration.
    // The string "plan_beats" only appears once in the file (as the prompt name), so this is safe.
    // Slice length of 3000 chars covers the full handler (~2000 chars); increase if handler grows.
    const planBeatsSection = promptsSource.slice(
        promptsSource.indexOf('"plan_beats"'),
        promptsSource.indexOf('"plan_beats"') + 3000
    );

    it("should register a plan_beats prompt", () => {
        expect(promptsSource).toContain('"plan_beats"');
    });

    it("should load the scene-drafting-assistant skill", () => {
        expect(planBeatsSection).toContain('loadSkill("scene-drafting-assistant")');
    });

    it("should prepend ANNIE_HARD_RULE in plan_beats prompt", () => {
        expect(planBeatsSection).toContain("ANNIE_HARD_RULE + contextHeader + skill.instructions");
    });

    it("should include scene status, chapter, and word count in context header", () => {
        expect(planBeatsSection).toContain("buildSceneContextHeader(focus, projectId, focus.scene.status)");
        const headerStart = promptsSource.indexOf("function buildSceneContextHeader");
        expect(headerStart).toBeGreaterThan(-1);
        const headerSection = promptsSource.slice(headerStart, headerStart + 1500);
        expect(headerSection).toContain("Status:");
        expect(headerSection).toContain("Chapter:");
        expect(headerSection).toContain("Word Count:");
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

    it("should tell Claude to fetch the task dashboard at session start", () => {
        expect(CLAUDE_COLLABORATION_INSTRUCTIONS).toContain(
            "Call `get_task_dashboard` at the start of a session"
        );
    });

    it("should tell Claude to offer to log follow-up work as a scene-linked task", () => {
        expect(CLAUDE_COLLABORATION_INSTRUCTIONS).toContain("create_writing_task");
        expect(CLAUDE_COLLABORATION_INSTRUCTIONS).toContain("setting `sceneId` to the scene");
        expect(CLAUDE_COLLABORATION_INSTRUCTIONS).toContain("Ask before creating it.");
    });

    it("should forbid writing prose or poetry to complete a writing task", () => {
        expect(CLAUDE_COLLABORATION_INSTRUCTIONS).toContain(
            "Never write prose or poetry to finish a writing task"
        );
    });
});

describe("update_paragraph intent field", () => {
    const updateParagraphSchema = schemaText(updateParagraphSpec);
    const updateParagraphSection = handlerSection(registerSources.structure, "updateParagraphSpec");

    it("should include intent enum in the update_paragraph schema", () => {
        expect(updateParagraphSchema).toContain("intent");
        expect(updateParagraphSchema).toContain("editorial");
        expect(updateParagraphSchema).toContain("creative");
    });

    it("should describe the prose-writing guard exemption in the intent field description", () => {
        expect(updateParagraphSchema).toContain("prose-writing guard does not apply");
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
    it("should register get_initial_instructions", () => {
        expect(registerSources.skills).toContain("registerTool(ctx, getInitialInstructionsSpec,");
    });

    it("should return CLAUDE_COLLABORATION_INSTRUCTIONS as text", () => {
        const toolSection = handlerSection(registerSources.skills, "getInitialInstructionsSpec");
        expect(toolSection).toContain("CLAUDE_COLLABORATION_INSTRUCTIONS");
        expect(toolSection).toContain('type: "text"');
    });
});

describe("cross_reference_story_bible has no human approval gate", () => {
    it("should NOT instruct the model to wait for author confirmation", () => {
        expect(allMcpSource).not.toContain("Never silently overwrite. Always ask before making changes.");
    });

    it("cross_reference_story_bible tool description should not mention confirmation flow", () => {
        expect(allMcpSource).not.toContain("confirmation flow");
    });

    it("cross_reference_story_bible Step 3 should use indicative language, not ask-for-confirmation language", () => {
        expect(promptsSource).toContain("indicate which is the source of truth");
    });
});

describe("StaleWriteError handler-level wrapping", () => {
    const handlers: [string, string][] = [
        ["update_project", registerSources.projects],
        ["update_node", registerSources.structure],
        ["write_scene_content", registerSources.structure],
        ["update_story_object", registerSources.storyObjects],
        ["update_universe", registerSources.universes],
        ["update_world_object", registerSources.universes],
        ["update_timeline_entry", registerSources.universes],
    ];
    const specName = (tool: string) => tool.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()) + "Spec";

    it("mcpRun helper returns isError: true on failure", () => {
        // All handlers delegate to mcpRun, which centralises error handling.
        const toolErrorsSource = read("../mcp/tool-errors.ts");
        expect(toolErrorsSource).toContain("isError: true");
        expect(toolErrorsSource).toContain("logger.error");
    });

    for (const [handler, source] of handlers) {
        it(`${handler} delegates to mcpRun for error handling`, () => {
            expect(handlerSection(source, specName(handler))).toContain("mcpRun");
        });
    }

    it("write_scene_content throws missing-arg error inside mcpRun callback (returns isError)", () => {
        const section = handlerSection(registerSources.structure, "writeSceneContentSpec");
        const throwIdx = section.indexOf('throw new UserFacingError("Either');
        // The throw is inside an mcpRun async callback — mcpRun's own catch block
        // handles it and returns isError: true. Verify the throw exists and mcpRun wraps it.
        expect(throwIdx).toBeGreaterThan(-1);
        expect(section).toContain("mcpRun");
    });
});

describe("review persona prompts", () => {
    it("buildReviewPrompt helper should include ANNIE_HARD_RULE and export_manuscript", () => {
        const helperStart = promptsSource.indexOf("function buildReviewPrompt");
        expect(helperStart).toBeGreaterThan(-1);
        const helperSection = promptsSource.slice(helperStart, helperStart + 1000);
        expect(helperSection).toContain("ANNIE_HARD_RULE");
        expect(helperSection).toContain("export_manuscript");
    });

    for (const promptName of ["review-editor", "review-fan", "review-author", "review-comedy", "review-actor"]) {
        describe(`${promptName} prompt`, () => {
            it(`should register the ${promptName} prompt`, () => {
                expect(promptsSource).toContain(`"${promptName}"`);
            });

            it(`should call buildReviewPrompt in ${promptName}`, () => {
                const start = promptsSource.indexOf(`"${promptName}"`);
                const section = promptsSource.slice(start, start + 3000);
                expect(section).toContain("buildReviewPrompt");
            });
        });
    }
});

describe("run_peer_review and get_peer_reviews tools", () => {
    const runSection = handlerSection(registerSources.skills, "runPeerReviewSpec");
    const getSection = handlerSection(registerSources.skills, "getPeerReviewsSpec");

    it("run_peer_review delegates error handling to mcpRun", () => {
        expect(runSection).toContain("mcpRun");
    });

    it("run_peer_review passes an error prefix to mcpRun", () => {
        expect(runSection).toContain("Error running peer review");
    });

    it("run_peer_review description names all five personas", () => {
        expect(runSection).toContain("acting coach");
        expect(runSection).not.toContain("four agents");
    });

    it("get_peer_reviews clamps limit with Math.min(Math.max(...))", () => {
        expect(getSection).toContain("Math.min(Math.max(limit");
    });

    it("get_peer_reviews returns a tool error on failure", () => {
        expect(getSection).toContain("toolError(");
    });

    it("get_peer_reviews limit description mentions max 20", () => {
        expect(schemaText(getPeerReviewsSpec)).toContain("max 20");
    });
});
