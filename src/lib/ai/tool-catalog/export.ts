import { z } from "zod";
import { defineTool } from "./types";

export const exportManuscriptSpec = defineTool({
    name: "export_manuscript",
    description: "Export the full manuscript as clean Markdown (front matter + parts/chapters/scenes). Returns the full text.",
    destructive: false,
    category: "export",
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
    }),
});

export const exportStoryBibleSpec = defineTool({
    name: "export_story_bible",
    description: "Export the story bible as Markdown (all characters, locations, plotlines, world elements, relationships)",
    destructive: false,
    category: "export",
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
    }),
});

export const exportHashnodeSpec = defineTool({
    name: "export_hashnode",
    description: "Export a specific node (Article/Chapter) or the entire project in Hashnode-ready Markdown format (with front matter)",
    destructive: false,
    category: "export",
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
        nodeId: z.string().optional().describe("The specific node ID to export (e.g. an Article ID). If omitted, exports all."),
    }),
});

export const getProjectSummarySpec = defineTool({
    name: "get_project_summary",
    description: "Get a structured overview of a project: metadata, node counts by type/status, story object counts by type, total word count",
    destructive: false,
    category: "core",
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
    }),
});

export const exportToGoogleDocsSpec = defineTool({
    name: "export_to_google_docs",
    description: "Export/sync a project or universe to Google Docs. Creates a new doc or updates existing one.",
    destructive: false,
    category: "export",
    parameters: z.object({
        projectId: z.string().optional().describe("Project ID to export"),
        universeId: z.string().optional().describe("Universe ID to export"),
        exportMode: z.enum(['UNIVERSE', 'STORY_INTERNAL', 'STORY_READER']).describe("Export mode"),
    }),
});
