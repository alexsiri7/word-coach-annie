import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listSkills, loadSkill } from "@/mcp/skills";
import { ANNIE_HARD_RULE } from "@/mcp/annie-voice";
import { REVIEW_SKILL_BY_STATUS } from "@/lib/review-routing";
import { REVIEW_PERSONAS } from "@/lib/review-personas";
import { getSceneFocus } from "@/mcp/tools/coaching";
import { assertProjectOwner as verifyProjectOwnership, projectIdForNode } from "@/lib/ownership";

type SceneFocus = Awaited<ReturnType<typeof getSceneFocus>>;

function buildSceneContextHeader(focus: SceneFocus, projectId: string, statusLine: string): string {
    const openAnnotations = focus.annotations.filter(a => !a.resolved);
    return `## Context
Project ID: ${projectId}
Target Node ID: ${focus.scene.id}
Scene: ${focus.scene.title}
Status: ${statusLine}
Chapter: ${focus.scene.chapterTitle || "N/A"}
Word Count: ${focus.scene.wordCount}
${focus.scene.prevScene ? `Previous Scene: ${focus.scene.prevScene.title}` : ""}
${focus.scene.nextScene ? `Next Scene: ${focus.scene.nextScene.title}` : ""}

### Linked Elements
${focus.relatedElements.length > 0
    ? focus.relatedElements.map(e => `- ${e.type}: ${e.name}${e.role ? ` (${e.role})` : ""}`).join("\n")
    : "(none)"}

### Open Annotations
${openAnnotations.length > 0
    ? openAnnotations.map(a => `- ${a.content}${a.selectedText ? ` [on: "${a.selectedText.slice(0, 60)}..."]` : ""}`).join("\n")
    : "(none)"}

---

`;
}

function buildReviewPrompt(projectId: string, mode: string, lens: string) {
    return {
        messages: [{
            role: "user" as const,
            content: {
                type: "text" as const,
                text: `${ANNIE_HARD_RULE}Project ID: ${projectId}\n\n## Review Mode: ${mode}\n\nUse the \`export_manuscript\` tool with this project ID to load the full manuscript text.\n\nThen apply this review lens:\n\n${lens}\n\nAfter your initial review, stay in conversation — answer follow-up questions and go deeper on any area the writer wants to explore.`,
            },
        }],
    };
}

export function registerPrompts(server: McpServer, userId: string | null): void {
    server.prompt(
        "scene-coaching",
        "Status-aware coaching for a scene. Adapts review approach based on whether the scene is OUTLINE, DRAFT, REVISED, or FINAL — each stage gets different coaching focus.",
        {
            sceneId: z.string().describe("The scene node ID to coach on"),
            projectId: z.string().optional().describe("The project ID (for broader context)"),
        },
        async (args) => {
            let contextNote = "";
            if (args.projectId) contextNote += `Project ID: ${args.projectId}\n`;
            if (args.sceneId) contextNote += `Scene ID: ${args.sceneId}\n`;

            return {
                messages: [{
                    role: "user",
                    content: {
                        type: "text",
                        text: `${ANNIE_HARD_RULE}${contextNote ? `## Context\n${contextNote}\n---\n\n` : ""}## Scene Coaching (Status-Aware)

You are Annie, a writing coach. Your job is to coach the writer on this scene.

**Step 1: Load scene context**
Use the \`get_scene_focus\` tool with the scene ID to get the scene's status, synopsis, linked characters, locations, plotlines, and open annotations.

**Step 2: Adapt your coaching to the scene's status**

### If status is OUTLINE:
- Focus on **story structure and planning**: Does the synopsis convey a clear scene goal? What's the conflict? What changes by the end?
- Suggest beat-by-beat structure. Identify which characters should appear and what each wants.
- Ask: "What is the ONE thing this scene must accomplish for the story?"
- Do NOT critique prose (there is none yet).

### If status is DRAFT:
- Focus on **big-picture feedback**: Does the scene deliver on its synopsis? Is the conflict clear? Do characters behave consistently?
- Check pacing: Is the opening too slow? Does the ending land?
- Flag missing elements: Are all linked characters present? Is the setting grounded?
- Light prose notes only if something actively confuses the reader.

### If status is REVISED:
- Focus on **craft-level polish**: Prose rhythm, word choice, voice consistency, dialogue authenticity.
- Use \`get_voice_context\` to check character voice if dialogue is present.
- Check for: filler words, passive voice overuse, telling vs showing, cliché.
- Verify continuity with adjacent scenes (prev/next from focus data).

### If status is FINAL:
- Focus on **proofreading and consistency**: Typos, grammar, formatting, factual consistency.
- Use \`get_consistency_context\` to cross-check character details and timeline.
- Flag only concrete errors. This is not the time for subjective style feedback.
- If the scene is genuinely polished, say so — don't manufacture issues.

**Step 3: Check annotations**
Review any open annotations on the scene. Address them in your feedback if relevant.

**Step 4: Deliver coaching**
Structure your response as:
1. **Scene snapshot** — one-sentence summary of what the scene does
2. **Status-appropriate feedback** — 3-5 specific, actionable points
3. **Annotation responses** — if any open annotations relate to your feedback
4. **Next step** — one concrete suggestion for the writer's next action`,
                    },
                }],
            };
        }
    );

    server.prompt(
        "review",
        "Context-aware scene review — automatically routes to the right skill based on scene status (OUTLINE→outline review, DRAFT→developmental edit, REVISED→line edit, FINAL→consistency check).",
        {
            sceneId: z.string().describe("The scene node ID to review"),
            projectId: z.string().optional().describe("The project ID (auto-detected from scene if omitted)"),
        },
        async (args) => {
            await verifyProjectOwnership(await projectIdForNode(args.sceneId), userId);
            const focus = await getSceneFocus(args.sceneId);
            const status = focus.scene.status as string;
            const projectId = args.projectId || focus.scene.projectId;
            const skillName = REVIEW_SKILL_BY_STATUS[status] ?? REVIEW_SKILL_BY_STATUS["DRAFT"];
            const skill = loadSkill(skillName);

            if (!skill) {
                return {
                    messages: [{
                        role: "user",
                        content: {
                            type: "text",
                            text: `Error: Could not load skill "${skillName}" for scene status "${status}". Available skills: ${listSkills().map(s => s.name).join(", ")}`,
                        },
                    }],
                };
            }

            const contextHeader = buildSceneContextHeader(
                focus,
                projectId,
                `${status} → Using skill: **${skill.metadata.name}** (${skill.metadata.description})`,
            );

            return {
                messages: [{
                    role: "user",
                    content: {
                        type: "text",
                        text: ANNIE_HARD_RULE + contextHeader + skill.instructions,
                    },
                }],
            };
        }
    );

    server.prompt(
        "plan_beats",
        "Map a scene as structured BEAT blocks — structural waypoints for what happens, what shifts, and what the reader feels. Annie provides the blueprint; the writer fills in the prose.",
        {
            sceneId: z.string().describe("The scene node ID to plan beats for"),
            projectId: z.string().optional().describe("The project ID (auto-detected from scene if omitted)"),
        },
        async (args) => {
            await verifyProjectOwnership(await projectIdForNode(args.sceneId), userId);
            const focus = await getSceneFocus(args.sceneId);
            const projectId = args.projectId || focus.scene.projectId;
            const skill = loadSkill("scene-drafting-assistant");

            if (!skill) {
                return {
                    messages: [{
                        role: "user",
                        content: {
                            type: "text",
                            text: `Error: Could not load skill "scene-drafting-assistant". Available skills: ${listSkills().map(s => s.name).join(", ")}`,
                        },
                    }],
                };
            }

            const contextHeader = buildSceneContextHeader(focus, projectId, focus.scene.status);

            return {
                messages: [{
                    role: "user",
                    content: {
                        type: "text",
                        text: ANNIE_HARD_RULE + contextHeader + skill.instructions,
                    },
                }],
            };
        }
    );

    server.prompt(
        "inline-edit",
        "Inline text editing operations: rewrite tighter, more vivid, simpler; continue writing; expand; voice check; or custom prompt on selected text.",
        {
            action: z.enum(["rewrite-tighter", "rewrite-vivid", "rewrite-simpler", "continue", "expand", "voice-check", "ask"]).describe("The editing action to perform"),
            selectedText: z.string().describe("The text to edit or analyze"),
            sceneContext: z.string().optional().describe("Surrounding text for context (a few paragraphs around the selection)"),
            askPrompt: z.string().optional().describe("Custom prompt (required when action is 'ask')"),
        },
        async (args) => {
            const actionInstructions: Record<string, string> = {
                "rewrite-tighter": "Coach the writer on how to make this passage tighter and more concise. Identify specific filler words, redundant phrases, or unnecessary detail. Show what to cut and why — but the rewriting is the author's job.",
                "rewrite-vivid": "Coach the writer on how to make this passage more vivid and evocative. Point out where stronger verbs, sensory detail, or concrete imagery would help. Give specific suggestions, but don't rewrite it for them.",
                "rewrite-simpler": "Coach the writer on how to simplify this passage. Flag complex words, long sentences, and indirect constructions. Suggest simpler alternatives, but let the author do the rewriting.",
                "continue": "The writer wants to continue from here but is stuck. Help them plan what comes next: suggest 2-3 possible directions with beat-level detail (what happens, what shifts, what the reader feels). Don't write the prose — map the path forward.",
                "expand": "The writer wants to expand this passage. Coach them on where to add depth: identify spots for sensory detail, internality, or action beats. Explain what each addition would accomplish. Don't write it — guide it.",
                "voice-check": "Analyze this passage for voice consistency and effectiveness. Comment on: sentence rhythm, word choice, point of view consistency, and any jarring shifts. Be specific and brief (2-4 sentences).",
                "ask": args.askPrompt || "What do you think about this passage?",
            };

            const instruction = actionInstructions[args.action] || actionInstructions["ask"];
            const contextBlock = args.sceneContext ? `\nContext (surrounding text):\n${args.sceneContext}\n` : "";
            const textLabel = args.action === "continue" ? "End of passage (continue from here)" : args.action === "voice-check" ? "Passage to review" : "Selected text";

            return {
                messages: [{
                    role: "user",
                    content: {
                        type: "text",
                        text: `${ANNIE_HARD_RULE}${instruction}${contextBlock}\n${textLabel}:\n${args.selectedText}`,
                    },
                }],
            };
        }
    );

    server.prompt(
        "manuscript-analysis",
        "Deep manuscript-level analysis: plot thread tracking, character arc evaluation, or consistency checking across the full project.",
        {
            projectId: z.string().describe("The project ID to analyze"),
            analysisType: z.enum(["plot-threads", "character-arcs", "consistency-check"]).describe("Type of analysis to perform"),
        },
        async (args) => {
            const instructions: Record<string, string> = {
                "plot-threads": `## Plot Thread Analysis

Use the \`get_manuscript_context\` tool to load the project outline, characters, and plotlines.
Then use \`get_plot_thread_status\` to see which threads are active, dormant, or newly introduced in each scene.

Analyze:
1. **Active threads** — which plot lines are being developed consistently
2. **Dormant threads** — threads introduced but not recently advanced (risk of being dropped)
3. **Unresolved threads** — threads that need payoff before the story ends
4. **Suggested connections** — opportunities to weave threads together for richer storytelling

Be specific about which scenes/chapters contain each thread. Keep it concise and actionable.`,

                "character-arcs": `## Character Arc Analysis

Use the \`get_manuscript_context\` tool to load the project outline, characters, and relationships.

For each major character, analyze:
1. **Arc type** — transformation, revelation, flat/steadfast, or fallen
2. **Current position** — where they are in their arc based on the manuscript
3. **Missing beats** — what arc beats are absent or underdeveloped
4. **Key relationships** — how relationships drive or reflect the arc

Be specific about which scenes show arc development. Format as one section per major character.`,

                "consistency-check": `## Consistency Check

**Step 1: Cross-reference story bible against prose.**
Use the \`cross_reference_story_bible\` tool to load all story objects alongside scene content.
Compare each story object's defined attributes against how they appear in the prose.
Follow the instructions included in the tool response for structuring mismatches.

**Step 2: Check for scene-to-scene contradictions.**
Use the \`get_consistency_context\` tool to load character profiles and scene content.

Look for specific contradictions:
1. **Character details** — appearance, backstory, traits mentioned differently across scenes
2. **Timeline** — events out of chronological order, impossible timing
3. **World/setting** — location descriptions that contradict each other
4. **Plot logic** — cause-effect gaps, character motivations that don't hold

**Step 3: Present findings.**
For each story bible vs prose mismatch, present both versions and indicate which is the source of truth:
- **A) Update story object** → use \`update_story_object\` to sync bible to prose
- **B) Flag scene** → use \`add_annotation\` to mark prose for revision
- **C) Keep both** → intentional difference, no action needed

Only report clear, specific contradictions with scene references. Do not report vague impressions.`,
            };

            return {
                messages: [{
                    role: "user",
                    content: {
                        type: "text",
                        text: `${ANNIE_HARD_RULE}Project ID: ${args.projectId}\n\n${instructions[args.analysisType]}`,
                    },
                }],
            };
        }
    );

    server.prompt(
        "review-editor",
        "Review manuscript as a seasoned acquisitions editor — commercial viability, hook strength, pacing, character arc payoff.",
        { projectId: z.string().describe("The project ID to review") },
        async (args) => buildReviewPrompt(
            args.projectId,
            REVIEW_PERSONAS["review-editor"].mode,
            REVIEW_PERSONAS["review-editor"].lens("your project"),
        )
    );

    server.prompt(
        "review-fan",
        "Review manuscript as an avid genre reader — visceral reader response, emotional reactions, genre expectations.",
        { projectId: z.string().describe("The project ID to review") },
        async (args) => buildReviewPrompt(
            args.projectId,
            REVIEW_PERSONAS["review-fan"].mode,
            REVIEW_PERSONAS["review-fan"].lens("your project"),
        )
    );

    server.prompt(
        "review-author",
        "Review manuscript as a published peer author — craft-level feedback on prose, POV, dialogue, scene construction.",
        { projectId: z.string().describe("The project ID to review") },
        async (args) => buildReviewPrompt(
            args.projectId,
            REVIEW_PERSONAS["review-author"].mode,
            REVIEW_PERSONAS["review-author"].lens("your project"),
        )
    );

    server.prompt(
        "review-comedy",
        "Review manuscript as a TV comedy writer — whether the jokes land, setup/punchline mechanics, comic timing, and character-specific humour.",
        { projectId: z.string().describe("The project ID to review") },
        async (args) => buildReviewPrompt(
            args.projectId,
            REVIEW_PERSONAS["review-comedy"].mode,
            REVIEW_PERSONAS["review-comedy"].lens("your project"),
        )
    );

    server.prompt(
        "review-actor",
        "Review manuscript as an acting coach — emotional truth, earned feeling, subtext, and whether emotional peaks have enough runway.",
        { projectId: z.string().describe("The project ID to review") },
        async (args) => buildReviewPrompt(
            args.projectId,
            REVIEW_PERSONAS["review-actor"].mode,
            REVIEW_PERSONAS["review-actor"].lens("your project"),
        )
    );

    // ─── Register Skills as MCP Prompts ──────────────────────────────────────────
    const availableSkills = listSkills();

    for (const skillMeta of availableSkills) {
        const skill = loadSkill(skillMeta.name);
        if (!skill) continue;

        server.prompt(
            skillMeta.name,
            skillMeta.description,
            {
                nodeId: z.string().optional().describe("The structure node ID to focus on (scene or chapter)"),
                projectId: z.string().optional().describe("The project ID for context"),
            },
            async (args) => {
                let contextHeader = "";
                if (args.projectId) {
                    contextHeader += `Project ID: ${args.projectId}\n`;
                }
                if (args.nodeId) {
                    contextHeader += `Target Node ID: ${args.nodeId}\n`;
                }
                if (contextHeader) {
                    contextHeader = `## Context\n${contextHeader}\n---\n\n`;
                }

                return {
                    messages: [
                        {
                            role: "user",
                            content: {
                                type: "text",
                                text: ANNIE_HARD_RULE + contextHeader + skill.instructions,
                            },
                        },
                    ],
                };
            }
        );
    }
}
