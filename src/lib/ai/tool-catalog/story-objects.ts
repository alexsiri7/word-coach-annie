import { z } from "zod";
import { ContentHash } from "@/schemas/content-hash";
import { defineTool } from "./types";

export const listStoryObjectsSpec = defineTool({
    name: "list_story_objects",
    description: "List story objects (characters, locations, plotlines, world elements, notes) with optional filtering",
    destructive: false,
    category: "core",
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
        type: z.enum(["CHARACTER", "LOCATION", "PLOTLINE", "WORLD_ELEMENT", "NOTE"]).optional().describe("Filter by type"),
        search: z.string().optional().describe("Search by name (case-insensitive contains)"),
        limit: z.number().optional().describe("Max objects to return (default 50)"),
        offset: z.number().optional().describe("Offset for pagination"),
    }),
});

export const getStoryObjectSpec = defineTool({
    name: "get_story_object",
    description: "Get a single story object with all its details and relationships",
    destructive: false,
    category: "characters",
    parameters: z.object({
        objectId: z.string().describe("The story object ID"),
    }),
});

export const createStoryObjectSpec = defineTool({
    name: "create_story_object",
    description: "Create a new story object (character, location, plotline, world element, or note)",
    destructive: false,
    category: "characters",
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
        type: z.enum(["CHARACTER", "LOCATION", "PLOTLINE", "WORLD_ELEMENT", "NOTE"]).describe("Object type"),
        name: z.string().describe("Object name"),
        description: z.string().optional().describe("Description"),
        notes: z.string().optional().describe("Additional notes"),
        role: z.string().optional().describe("Role (for characters: protagonist, antagonist, supporting, minor)"),
        tags: z.string().optional().describe("Comma-separated tags"),
    }),
});

export const updateStoryObjectSpec = defineTool({
    name: "update_story_object",
    description: "Update a story object's fields (name, description, notes, role, tags). Requires contentHash from get_story_object to prevent stale overwrites.",
    destructive: false,
    category: "characters",
    parameters: z.object({
        objectId: z.string().describe("The story object ID"),
        contentHash: ContentHash.storyObject,
        name: z.string().optional().describe("New name"),
        description: z.string().optional().describe("New description"),
        notes: z.string().optional().describe("New notes"),
        role: z.string().nullable().optional().describe("New role (null to clear)"),
        tags: z.string().optional().describe("New comma-separated tags"),
    }),
});

export const deleteStoryObjectSpec = defineTool({
    name: "delete_story_object",
    description: "Delete a story object and all its relationships.",
    destructive: true,
    category: "characters",
    parameters: z.object({
        objectId: z.string().describe("The story object ID to delete"),
    }),
});

export const batchCreateStoryObjectsSpec = defineTool({
    name: "batch_create_story_objects",
    description: "Create multiple story objects in a single operation. Returns per-item results with successes and errors. Max 50 per batch.",
    destructive: false,
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
        objects: z.array(z.object({
            type: z.enum(["CHARACTER", "LOCATION", "PLOTLINE", "WORLD_ELEMENT", "NOTE"]).describe("Object type"),
            name: z.string().describe("Object name"),
            description: z.string().optional().describe("Description"),
            notes: z.string().optional().describe("Additional notes"),
            role: z.string().optional().describe("Role (for characters)"),
            tags: z.string().optional().describe("Comma-separated tags"),
        })).describe("Array of story objects to create"),
    }),
});

export const batchUpdateStoryObjectsSpec = defineTool({
    name: "batch_update_story_objects",
    description: "Update multiple story objects in a single operation. Returns per-item results with successes and errors. Max 50 per batch.",
    destructive: false,
    parameters: z.object({
        updates: z.array(z.object({
            objectId: z.string().describe("The story object ID"),
            name: z.string().optional().describe("New name"),
            description: z.string().optional().describe("New description"),
            notes: z.string().optional().describe("New notes"),
            role: z.string().nullable().optional().describe("New role (null to clear)"),
            tags: z.string().optional().describe("New comma-separated tags"),
        })).describe("Array of updates to apply"),
    }),
});

export const batchDeleteStoryObjectsSpec = defineTool({
    name: "batch_delete_story_objects",
    description: "Delete multiple story objects and their relationships in a single operation. Max 50 per batch.",
    destructive: true,
    parameters: z.object({
        objectIds: z.array(z.string()).describe("Array of story object IDs to delete"),
    }),
});
