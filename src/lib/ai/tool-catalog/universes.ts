import { z } from "zod";
import { ContentHash } from "@/schemas/content-hash";
import { defineTool } from "./types";

export const listUniversesSpec = defineTool({
    name: "list_universes",
    description: "List all universes",
    destructive: false,
    category: "world_building",
    parameters: z.object({}),
});

export const getUniverseSpec = defineTool({
    name: "get_universe",
    description: "Get a universe by ID with its world objects and linked projects",
    destructive: false,
    category: "world_building",
    parameters: z.object({
        universeId: z.string().describe("The universe ID"),
    }),
});

export const createUniverseSpec = defineTool({
    name: "create_universe",
    description: "Create a new universe",
    destructive: false,
    category: "world_building",
    parameters: z.object({
        title: z.string().describe("Universe title"),
        description: z.string().optional().describe("Universe description"),
    }),
});

export const updateUniverseSpec = defineTool({
    name: "update_universe",
    description: "Update a universe's metadata. Requires contentHash from get_universe to prevent stale overwrites.",
    destructive: false,
    category: "world_building",
    parameters: z.object({
        universeId: z.string().describe("The universe ID"),
        contentHash: ContentHash.universe,
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
    }),
});

export const deleteUniverseSpec = defineTool({
    name: "delete_universe",
    description: "Delete a universe and all its world objects and timeline entries",
    destructive: true,
    category: "world_building",
    parameters: z.object({
        universeId: z.string().describe("The universe ID"),
    }),
});

export const listWorldObjectsSpec = defineTool({
    name: "list_world_objects",
    description: "List world objects in a universe",
    destructive: false,
    category: "world_building",
    parameters: z.object({
        universeId: z.string().describe("The universe ID"),
        type: z.string().optional().describe("Filter by type (CHARACTER, LOCATION, WORLD_ELEMENT)"),
    }),
});

export const getWorldObjectSpec = defineTool({
    name: "get_world_object",
    description: "Get a world object by ID with its full timeline",
    destructive: false,
    category: "world_building",
    parameters: z.object({
        objectId: z.string().describe("The world object ID"),
    }),
});

export const createWorldObjectSpec = defineTool({
    name: "create_world_object",
    description: "Create a new world object in a universe",
    destructive: false,
    category: "world_building",
    parameters: z.object({
        universeId: z.string().describe("The universe ID"),
        type: z.enum(["CHARACTER", "LOCATION", "WORLD_ELEMENT"]).describe("Object type"),
        name: z.string().describe("Object name"),
        description: z.string().optional().describe("Description"),
        notes: z.string().optional().describe("Additional notes"),
        tags: z.string().optional().describe("Comma-separated tags"),
    }),
});

export const updateWorldObjectSpec = defineTool({
    name: "update_world_object",
    description: "Update a world object's fields. Requires contentHash from get_world_object to prevent stale overwrites.",
    destructive: false,
    category: "world_building",
    parameters: z.object({
        objectId: z.string().describe("The world object ID"),
        contentHash: ContentHash.worldObject,
        name: z.string().optional().describe("New name"),
        description: z.string().optional().describe("New description"),
        notes: z.string().optional().describe("New notes"),
        tags: z.string().optional().describe("New tags"),
        type: z.string().optional().describe("New type"),
    }),
});

export const deleteWorldObjectSpec = defineTool({
    name: "delete_world_object",
    description: "Delete a world object and its timeline",
    destructive: true,
    category: "world_building",
    parameters: z.object({
        objectId: z.string().describe("The world object ID"),
    }),
});

export const addTimelineEntrySpec = defineTool({
    name: "add_timeline_entry",
    description: "Add a state-history entry to a world object's timeline. Timeline entries track how an object changes over story time (e.g. 'Year 12 — apprenticed to the blacksmith'). Use this to record key life events, status changes, or turning points so Annie can check consistency across scenes set at different points in the story.",
    destructive: false,
    category: "world_building",
    parameters: z.object({
        worldObjectId: z.string().describe("The world object ID"),
        label: z.string().describe("Period or event label (e.g. 'Year 12', 'Post-War', 'Age 20')"),
        description: z.string().optional().describe("What is true about this object at this point in story time"),
        attributes: z.string().optional().describe("JSON blob for structured data"),
        projectId: z.string().optional().describe("Optional project ID this entry relates to"),
        orderIndex: z.number().optional().describe("Order index (appends to end if omitted)"),
    }),
});

export const updateTimelineEntrySpec = defineTool({
    name: "update_timeline_entry",
    description: "Update a world object's timeline entry. Timeline entries are state-history records tracking how an object changes over story time — use this to correct or expand what is true about the object at a given period. Requires contentHash from get_world_object (the entry's contentHash in the timeline array) to prevent stale overwrites.",
    destructive: false,
    category: "world_building",
    parameters: z.object({
        entryId: z.string().describe("The entry ID"),
        contentHash: ContentHash.timelineEntry,
        label: z.string().optional().describe("New period or event label"),
        description: z.string().optional().describe("Updated description of what is true at this point"),
        attributes: z.string().optional().describe("New JSON blob"),
        orderIndex: z.number().optional().describe("New order index"),
    }),
});

export const deleteTimelineEntrySpec = defineTool({
    name: "delete_timeline_entry",
    description: "Delete a state-history entry from a world object's timeline",
    destructive: true,
    category: "world_building",
    parameters: z.object({
        entryId: z.string().describe("The entry ID"),
    }),
});

export const reorderTimelineEntriesSpec = defineTool({
    name: "reorder_timeline_entries",
    description: "Reorder timeline entries for a world object",
    destructive: false,
    category: "world_building",
    parameters: z.object({
        worldObjectId: z.string().describe("The world object ID"),
        orderedIds: z.array(z.string()).describe("Ordered entry IDs"),
    }),
});

export const transferStoryObjectToUniverseSpec = defineTool({
    name: "transfer_story_object_to_universe",
    description: "Transfer a story object (from a project) into a universe as a world object",
    destructive: false,
    category: "world_building",
    parameters: z.object({
        storyObjectId: z.string().describe("The story object ID"),
        universeId: z.string().describe("The universe ID"),
    }),
});

export const linkProjectToUniverseSpec = defineTool({
    name: "link_project_to_universe",
    description: "Link a project to a universe",
    destructive: false,
    category: "world_building",
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
        universeId: z.string().describe("The universe ID"),
    }),
});

export const unlinkProjectFromUniverseSpec = defineTool({
    name: "unlink_project_from_universe",
    description: "Unlink a project from its universe",
    destructive: false,
    category: "world_building",
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
    }),
});
