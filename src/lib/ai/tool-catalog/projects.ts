import { z } from "zod";
import { ContentHash } from "@/schemas/content-hash";
import { ProjectType } from "@/schemas/projects";
import { defineTool } from "./types";

export const listProjectsSpec = defineTool({
    name: "list_projects",
    description: "List all writing projects with word counts and metadata",
    destructive: false,
    category: "core",
    parameters: z.object({
        limit: z.number().optional().describe("Max projects to return (default 20)"),
        offset: z.number().optional().describe("Offset for pagination"),
    }),
});

export const getProjectSpec = defineTool({
    name: "get_project",
    description: "Get a single project's details by ID",
    destructive: false,
    category: "core",
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
    }),
});

export const createProjectSpec = defineTool({
    name: "create_project",
    description: "Create a new writing project",
    destructive: false,
    category: "admin",
    parameters: z.object({
        title: z.string().describe("Project title"),
        author: z.string().optional().describe("Author name"),
        synopsis: z.string().optional().describe("Project synopsis"),
        genre: z.string().optional().describe("Genre"),
        projectType: ProjectType.optional().describe("FICTION (default), ARTICLE_COLLECTION, GENERAL or GAME"),
    }),
});

export const updateProjectSpec = defineTool({
    name: "update_project",
    description: "Update a project's metadata (title, author, synopsis, genre). Requires contentHash from get_project to prevent stale overwrites.",
    destructive: false,
    category: "admin",
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
        contentHash: ContentHash.project,
        title: z.string().optional().describe("New project title"),
        author: z.string().optional().describe("New author name"),
        synopsis: z.string().optional().describe("New synopsis"),
        genre: z.string().optional().describe("New genre"),
    }),
});
