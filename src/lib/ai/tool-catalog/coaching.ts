import { z } from "zod";
import { defineTool } from "./types";

export const getPlotThreadStatusSpec = defineTool({
    name: "get_plot_thread_status",
    description: "Track plotline engagement across scenes. Shows which plot threads are advancing, newly mentioned, or dormant in each scene — essential for spotting dropped threads.",
    destructive: false,
    category: "core",
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
    }),
});

export const getSceneFocusSpec = defineTool({
    name: "get_scene_focus",
    description: "Get complete context for coaching on a single scene: scene metadata, status, word count, adjacent scenes, linked characters/locations/plotlines, and open annotations.",
    destructive: false,
    category: "core",
    parameters: z.object({
        sceneId: z.string().describe("The scene node ID"),
    }),
});

export const getManuscriptContextSpec = defineTool({
    name: "get_manuscript_context",
    description: "Get the full manuscript context for analysis: outline with scene previews, character profiles, plotline summaries, and relationships. Use this before running manuscript-level analysis.",
    destructive: false,
    category: "core",
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
    }),
});

export const getConsistencyContextSpec = defineTool({
    name: "get_consistency_context",
    description: "Gather character profiles and scene text for consistency analysis. Optionally focus on a single scene. Returns structured data ready for identifying contradictions.",
    destructive: false,
    category: "core",
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
        sceneId: z.string().optional().describe("Focus on a specific scene (if omitted, checks up to 20 scenes)"),
    }),
});

export const crossReferenceStoryBibleSpec = defineTool({
    name: "cross_reference_story_bible",
    description: "Cross-reference prose content against story object definitions. Returns all story objects (characters, locations, world elements, plotlines) with full details alongside scene text and relationship mappings. Use this to find attribute mismatches, behavioural inconsistencies, and timeline contradictions between what the story bible defines and what the prose actually says.",
    destructive: false,
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
        sceneId: z.string().optional().describe("Focus on a specific scene (if omitted, checks up to 15 scenes)"),
    }),
});

export const getVoiceContextSpec = defineTool({
    name: "get_voice_context",
    description: "Gather character profiles and scene dialogue for voice consistency analysis. Returns characters linked to the scene with their descriptions and the scene text.",
    destructive: false,
    category: "core",
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
        sceneId: z.string().describe("The scene to analyze"),
    }),
});
