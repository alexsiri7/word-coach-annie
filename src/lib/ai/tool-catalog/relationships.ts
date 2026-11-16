import { z } from "zod";
import { defineTool } from "./types";

export const listRelationshipsSpec = defineTool({
    name: "list_relationships",
    description: "List all relationships in a project (character appears in scene, location contains element, etc.)",
    destructive: false,
    category: "characters",
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
    }),
});

export const createRelationshipSpec = defineTool({
    name: "create_relationship",
    description: "Create a typed relationship between two entities. Provide exactly one from-field and one to-field.",
    destructive: false,
    category: "characters",
    parameters: z.object({
        projectId: z.string().describe("The project ID (for validation)"),
        type: z.enum(["APPEARS_IN", "LOCATED_AT", "PART_OF_PLOTLINE", "RELATED_TO", "INTERACTS_WITH", "CONTAINS", "PRECEDES", "FOLLOWS"]).describe("Relationship type"),
        fromNodeId: z.string().optional().describe("Source structure node ID"),
        fromObjectId: z.string().optional().describe("Source story object ID"),
        toNodeId: z.string().optional().describe("Target structure node ID"),
        toObjectId: z.string().optional().describe("Target story object ID"),
        label: z.string().optional().describe("Optional label/description for the relationship"),
    }),
});

export const deleteRelationshipSpec = defineTool({
    name: "delete_relationship",
    description: "Delete a relationship between two entities.",
    destructive: true,
    category: "characters",
    parameters: z.object({
        relationshipId: z.string().describe("The relationship ID to delete"),
    }),
});
