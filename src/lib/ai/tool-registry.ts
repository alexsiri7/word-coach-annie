import { z, ZodObject, ZodRawShape, ZodTypeAny } from "zod";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ToolCategory =
    | "core"
    | "structure"
    | "characters"
    | "world_building"
    | "export"
    | "admin"
    | "skills";

export interface ToolDefinition {
    name: string;
    description: string;
    category: ToolCategory;
    parameters: ZodObject<ZodRawShape>;
}

/** OpenAI function-calling tool format */
export interface OpenAIToolDefinition {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

// ─── Zod → JSON Schema converter (minimal, covers our tool param types) ─────

function zodToJsonSchema(schema: ZodObject<ZodRawShape>): Record<string, unknown> {
    const shape = schema.shape;
    const properties: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];

    for (const [key, fieldSchema] of Object.entries(shape)) {
        const { jsonSchema, isOptional } = zodFieldToJson(fieldSchema as ZodTypeAny);
        properties[key] = jsonSchema;
        if (!isOptional) {
            required.push(key);
        }
    }

    const result: Record<string, unknown> = {
        type: "object",
        properties,
    };
    if (required.length > 0) {
        result.required = required;
    }
    return result;
}

function zodFieldToJson(field: ZodTypeAny): { jsonSchema: Record<string, unknown>; isOptional: boolean } {
    const def = field._def;
    let isOptional = false;

    // Unwrap optionals
    if (def.typeName === "ZodOptional") {
        const inner = zodFieldToJson(def.innerType);
        return { jsonSchema: inner.jsonSchema, isOptional: true };
    }

    // Unwrap nullables
    if (def.typeName === "ZodNullable") {
        const inner = zodFieldToJson(def.innerType);
        return { jsonSchema: { ...inner.jsonSchema, nullable: true }, isOptional: inner.isOptional };
    }

    const result: Record<string, unknown> = {};
    const description = def.description;

    switch (def.typeName) {
        case "ZodString":
            result.type = "string";
            break;
        case "ZodNumber":
            result.type = "number";
            break;
        case "ZodBoolean":
            result.type = "boolean";
            break;
        case "ZodEnum":
            result.type = "string";
            result.enum = def.values;
            break;
        case "ZodArray": {
            result.type = "array";
            const itemResult = zodFieldToJson(def.type);
            result.items = itemResult.jsonSchema;
            break;
        }
        case "ZodObject":
            Object.assign(result, zodToJsonSchema(field as ZodObject<ZodRawShape>));
            break;
        default:
            result.type = "string";
    }

    if (description) {
        result.description = description;
    }

    return { jsonSchema: result, isOptional };
}

// ─── Tool Registry ──────────────────────────────────────────────────────────

const tools: ToolDefinition[] = [
    // ─── Core (always loaded, ~8 read-only tools) ───────────────────────────
    {
        name: "list_projects",
        description: "List all writing projects with word counts and metadata",
        category: "core",
        parameters: z.object({
            limit: z.number().optional().describe("Max projects to return (default 20)"),
            offset: z.number().optional().describe("Offset for pagination"),
        }),
    },
    {
        name: "get_project",
        description: "Get a single project's details by ID",
        category: "core",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
        }),
    },
    {
        name: "get_outline",
        description: "Get the full hierarchical manuscript outline (parts → chapters → scenes) with word counts and statuses",
        category: "core",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
        }),
    },
    {
        name: "read_scene_content",
        description: "Read the latest content of a scene (returns HTML content, word count, and list of annotations)",
        category: "core",
        parameters: z.object({
            nodeId: z.string().describe("The scene node ID"),
        }),
    },
    {
        name: "list_story_objects",
        description: "List story objects (characters, locations, plotlines, world elements, notes) with optional filtering",
        category: "core",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
            type: z.enum(["CHARACTER", "LOCATION", "PLOTLINE", "WORLD_ELEMENT", "NOTE"]).optional().describe("Filter by type"),
            search: z.string().optional().describe("Search by name (case-insensitive contains)"),
            limit: z.number().optional().describe("Max objects to return (default 50)"),
            offset: z.number().optional().describe("Offset for pagination"),
        }),
    },
    {
        name: "get_project_summary",
        description: "Get a structured overview of a project: metadata, node counts by type/status, story object counts by type, total word count",
        category: "core",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
        }),
    },
    {
        name: "get_open_annotations",
        description: "Get all unresolved annotations across the project (or filtered by project ID)",
        category: "core",
        parameters: z.object({
            projectId: z.string().optional().describe("Optional project ID to filter by"),
        }),
    },
    {
        name: "list_skills",
        description: "List all available writing skills (structured instruction sets for writing tasks)",
        category: "core",
        parameters: z.object({}),
    },

    // ─── Structure ──────────────────────────────────────────────────────────
    {
        name: "create_node",
        description: "Create a new structure node (PART, CHAPTER, or SCENE) in the manuscript outline",
        category: "structure",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
            type: z.enum(["PART", "CHAPTER", "SCENE"]).describe("Node type"),
            title: z.string().describe("Node title"),
            parentId: z.string().optional().describe("Parent node ID"),
            synopsis: z.string().optional().describe("Brief synopsis"),
            status: z.enum(["OUTLINE", "DRAFT", "REVISED", "FINAL"]).optional().describe("Scene status (default OUTLINE)"),
            insertAfterIndex: z.number().optional().describe("Insert after this order index"),
        }),
    },
    {
        name: "update_node",
        description: "Update a structure node's title, synopsis, status, order, or parent",
        category: "structure",
        parameters: z.object({
            nodeId: z.string().describe("The node ID to update"),
            title: z.string().optional().describe("New title"),
            synopsis: z.string().optional().describe("New synopsis"),
            status: z.enum(["OUTLINE", "DRAFT", "REVISED", "FINAL"]).optional().describe("New status"),
            orderIndex: z.number().optional().describe("New order index"),
            parentId: z.string().nullable().optional().describe("New parent node ID (null to make top-level)"),
        }),
    },
    {
        name: "delete_node",
        description: "Delete a structure node and all its children, content versions, and relationships",
        category: "structure",
        parameters: z.object({
            nodeId: z.string().describe("The node ID to delete"),
        }),
    },
    {
        name: "write_scene_content",
        description: "Write new content to a scene. Provide either 'content' (HTML string) or 'blocks' (structured content/beat array)",
        category: "structure",
        parameters: z.object({
            nodeId: z.string().describe("The scene node ID"),
            content: z.string().optional().describe("The HTML content to write"),
            blocks: z.array(z.object({
                type: z.enum(["CONTENT", "BEAT"]),
                content: z.string(),
            })).optional().describe("Structured content blocks"),
        }),
    },
    {
        name: "get_scene_versions",
        description: "List the version history of a scene (timestamps and word counts)",
        category: "structure",
        parameters: z.object({
            nodeId: z.string().describe("The scene node ID"),
            limit: z.number().optional().describe("Max versions to return (default 20)"),
        }),
    },
    {
        name: "restore_scene_version",
        description: "Restore a previous version of a scene's content (non-destructive)",
        category: "structure",
        parameters: z.object({
            nodeId: z.string().describe("The scene node ID"),
            versionId: z.string().describe("The version ID to restore"),
        }),
    },
    {
        name: "add_annotation",
        description: "Add an annotation to a node",
        category: "structure",
        parameters: z.object({
            nodeId: z.string().describe("The node ID"),
            content: z.string().describe("Annotation content"),
            range: z.string().optional().describe("Text range"),
            selectedText: z.string().optional().describe("Selected text"),
        }),
    },
    {
        name: "update_annotation",
        description: "Update an existing annotation",
        category: "structure",
        parameters: z.object({
            annotationId: z.string().describe("The annotation ID"),
            content: z.string().optional().describe("New content"),
            resolved: z.boolean().optional().describe("Resolved status"),
        }),
    },
    {
        name: "delete_annotation",
        description: "Delete an annotation",
        category: "structure",
        parameters: z.object({
            annotationId: z.string().describe("The annotation ID"),
        }),
    },
    {
        name: "resolve_annotation",
        description: "Resolve or unresolve an annotation",
        category: "structure",
        parameters: z.object({
            annotationId: z.string().describe("The annotation ID"),
            resolved: z.boolean().describe("Resolved status"),
        }),
    },

    // ─── Characters (story objects) ─────────────────────────────────────────
    {
        name: "get_story_object",
        description: "Get a single story object with all its details and relationships",
        category: "characters",
        parameters: z.object({
            objectId: z.string().describe("The story object ID"),
        }),
    },
    {
        name: "create_story_object",
        description: "Create a new story object (character, location, plotline, world element, or note)",
        category: "characters",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
            type: z.enum(["CHARACTER", "LOCATION", "PLOTLINE", "WORLD_ELEMENT", "NOTE"]).describe("Object type"),
            name: z.string().describe("Object name"),
            description: z.string().optional().describe("Description"),
            notes: z.string().optional().describe("Additional notes"),
            role: z.string().optional().describe("Role (for characters)"),
            tags: z.string().optional().describe("Comma-separated tags"),
        }),
    },
    {
        name: "update_story_object",
        description: "Update a story object's fields",
        category: "characters",
        parameters: z.object({
            objectId: z.string().describe("The story object ID"),
            name: z.string().optional().describe("New name"),
            description: z.string().optional().describe("New description"),
            notes: z.string().optional().describe("New notes"),
            role: z.string().nullable().optional().describe("New role (null to clear)"),
            tags: z.string().optional().describe("New comma-separated tags"),
        }),
    },
    {
        name: "delete_story_object",
        description: "Delete a story object and all its relationships",
        category: "characters",
        parameters: z.object({
            objectId: z.string().describe("The story object ID to delete"),
        }),
    },
    {
        name: "list_relationships",
        description: "List all relationships in a project",
        category: "characters",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
        }),
    },
    {
        name: "create_relationship",
        description: "Create a typed relationship between two entities",
        category: "characters",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
            type: z.enum(["APPEARS_IN", "LOCATED_AT", "PART_OF_PLOTLINE", "RELATED_TO", "INTERACTS_WITH", "CONTAINS", "PRECEDES", "FOLLOWS"]).describe("Relationship type"),
            fromNodeId: z.string().optional().describe("Source structure node ID"),
            fromObjectId: z.string().optional().describe("Source story object ID"),
            toNodeId: z.string().optional().describe("Target structure node ID"),
            toObjectId: z.string().optional().describe("Target story object ID"),
            label: z.string().optional().describe("Optional label"),
        }),
    },
    {
        name: "delete_relationship",
        description: "Delete a relationship between two entities",
        category: "characters",
        parameters: z.object({
            relationshipId: z.string().describe("The relationship ID to delete"),
        }),
    },

    // ─── World Building (universes) ─────────────────────────────────────────
    {
        name: "list_universes",
        description: "List all universes",
        category: "world_building",
        parameters: z.object({}),
    },
    {
        name: "get_universe",
        description: "Get a universe by ID with its world objects and linked projects",
        category: "world_building",
        parameters: z.object({
            universeId: z.string().describe("The universe ID"),
        }),
    },
    {
        name: "create_universe",
        description: "Create a new universe",
        category: "world_building",
        parameters: z.object({
            title: z.string().describe("Universe title"),
            description: z.string().optional().describe("Universe description"),
        }),
    },
    {
        name: "update_universe",
        description: "Update a universe's metadata",
        category: "world_building",
        parameters: z.object({
            universeId: z.string().describe("The universe ID"),
            title: z.string().optional().describe("New title"),
            description: z.string().optional().describe("New description"),
        }),
    },
    {
        name: "delete_universe",
        description: "Delete a universe and all its world objects and timeline entries",
        category: "world_building",
        parameters: z.object({
            universeId: z.string().describe("The universe ID"),
        }),
    },
    {
        name: "list_world_objects",
        description: "List world objects in a universe",
        category: "world_building",
        parameters: z.object({
            universeId: z.string().describe("The universe ID"),
            type: z.string().optional().describe("Filter by type (CHARACTER, LOCATION, WORLD_ELEMENT)"),
        }),
    },
    {
        name: "get_world_object",
        description: "Get a world object by ID with its full timeline",
        category: "world_building",
        parameters: z.object({
            objectId: z.string().describe("The world object ID"),
        }),
    },
    {
        name: "create_world_object",
        description: "Create a new world object in a universe",
        category: "world_building",
        parameters: z.object({
            universeId: z.string().describe("The universe ID"),
            type: z.enum(["CHARACTER", "LOCATION", "WORLD_ELEMENT"]).describe("Object type"),
            name: z.string().describe("Object name"),
            description: z.string().optional().describe("Description"),
            notes: z.string().optional().describe("Additional notes"),
            tags: z.string().optional().describe("Comma-separated tags"),
        }),
    },
    {
        name: "update_world_object",
        description: "Update a world object's fields",
        category: "world_building",
        parameters: z.object({
            objectId: z.string().describe("The world object ID"),
            name: z.string().optional().describe("New name"),
            description: z.string().optional().describe("New description"),
            notes: z.string().optional().describe("New notes"),
            tags: z.string().optional().describe("New tags"),
            type: z.string().optional().describe("New type"),
        }),
    },
    {
        name: "delete_world_object",
        description: "Delete a world object and its timeline",
        category: "world_building",
        parameters: z.object({
            objectId: z.string().describe("The world object ID"),
        }),
    },
    {
        name: "add_timeline_entry",
        description: "Add a timeline entry to a world object",
        category: "world_building",
        parameters: z.object({
            worldObjectId: z.string().describe("The world object ID"),
            label: z.string().describe("Entry label"),
            description: z.string().optional().describe("Detailed description"),
            attributes: z.string().optional().describe("JSON blob for structured data"),
            projectId: z.string().optional().describe("Optional project ID this entry relates to"),
            orderIndex: z.number().optional().describe("Order index"),
        }),
    },
    {
        name: "update_timeline_entry",
        description: "Update a timeline entry",
        category: "world_building",
        parameters: z.object({
            entryId: z.string().describe("The entry ID"),
            label: z.string().optional().describe("New label"),
            description: z.string().optional().describe("New description"),
            attributes: z.string().optional().describe("New JSON blob"),
            orderIndex: z.number().optional().describe("New order index"),
        }),
    },
    {
        name: "delete_timeline_entry",
        description: "Delete a timeline entry",
        category: "world_building",
        parameters: z.object({
            entryId: z.string().describe("The entry ID"),
        }),
    },
    {
        name: "reorder_timeline_entries",
        description: "Reorder timeline entries for a world object",
        category: "world_building",
        parameters: z.object({
            worldObjectId: z.string().describe("The world object ID"),
            orderedIds: z.array(z.string()).describe("Ordered entry IDs"),
        }),
    },
    {
        name: "transfer_story_object_to_universe",
        description: "Transfer a story object (from a project) into a universe as a world object",
        category: "world_building",
        parameters: z.object({
            storyObjectId: z.string().describe("The story object ID"),
            universeId: z.string().describe("The universe ID"),
        }),
    },
    {
        name: "link_project_to_universe",
        description: "Link a project to a universe",
        category: "world_building",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
            universeId: z.string().describe("The universe ID"),
        }),
    },
    {
        name: "unlink_project_from_universe",
        description: "Unlink a project from its universe",
        category: "world_building",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
        }),
    },

    // ─── Export ──────────────────────────────────────────────────────────────
    {
        name: "export_manuscript",
        description: "Export the full manuscript as clean Markdown",
        category: "export",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
        }),
    },
    {
        name: "export_story_bible",
        description: "Export the story bible as Markdown (all characters, locations, plotlines, world elements, relationships)",
        category: "export",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
        }),
    },
    {
        name: "export_medium",
        description: "Export a node or project in Medium-ready Markdown format",
        category: "export",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
            nodeId: z.string().optional().describe("Specific node ID to export"),
        }),
    },
    {
        name: "export_to_google_docs",
        description: "Export/sync a project or universe to Google Docs",
        category: "export",
        parameters: z.object({
            projectId: z.string().optional().describe("Project ID to export"),
            universeId: z.string().optional().describe("Universe ID to export"),
            exportMode: z.enum(["UNIVERSE", "STORY_INTERNAL", "STORY_READER"]).describe("Export mode"),
        }),
    },

    // ─── Admin ──────────────────────────────────────────────────────────────
    {
        name: "create_project",
        description: "Create a new writing project",
        category: "admin",
        parameters: z.object({
            title: z.string().describe("Project title"),
            author: z.string().optional().describe("Author name"),
            synopsis: z.string().optional().describe("Project synopsis"),
            genre: z.string().optional().describe("Genre"),
        }),
    },
    {
        name: "update_project",
        description: "Update a project's metadata",
        category: "admin",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
            title: z.string().optional().describe("New project title"),
            author: z.string().optional().describe("New author name"),
            synopsis: z.string().optional().describe("New synopsis"),
            genre: z.string().optional().describe("New genre"),
        }),
    },
    {
        name: "snapshot_database",
        description: "Create a named snapshot of the current database state",
        category: "admin",
        parameters: z.object({
            message: z.string().describe("Description of what's about to change"),
        }),
    },
    {
        name: "list_snapshots",
        description: "List recent database snapshots with timestamps and messages",
        category: "admin",
        parameters: z.object({
            limit: z.number().optional().describe("Max snapshots to return (default 20)"),
        }),
    },
    {
        name: "restore_snapshot",
        description: "Restore the database to a previous snapshot",
        category: "admin",
        parameters: z.object({
            commitHash: z.string().describe("The snapshot commit hash to restore"),
        }),
    },
    {
        name: "google_auth_status",
        description: "Check if Google credentials are configured and valid",
        category: "admin",
        parameters: z.object({}),
    },
    {
        name: "google_auth_connect",
        description: "Initiate OAuth flow; returns auth URL for the user to visit",
        category: "admin",
        parameters: z.object({}),
    },
    {
        name: "google_auth_callback",
        description: "Complete OAuth flow with the authorization code",
        category: "admin",
        parameters: z.object({
            code: z.string().describe("The authorization code from the redirect URL"),
        }),
    },
    {
        name: "google_auth_disconnect",
        description: "Revoke and delete stored Google credentials",
        category: "admin",
        parameters: z.object({}),
    },

    // ─── Skills ─────────────────────────────────────────────────────────────
    // list_skills is in core; this category is reserved for skill invocation
];

// ─── load_toolset meta-tool ─────────────────────────────────────────────────

export const LOAD_TOOLSET_DEFINITION: OpenAIToolDefinition = {
    type: "function",
    function: {
        name: "load_toolset",
        description:
            "Load additional tool categories into the current session. " +
            "Available categories: structure, characters, world_building, export, admin, skills. " +
            "Core tools are always loaded.",
        parameters: {
            type: "object",
            properties: {
                category: {
                    type: "string",
                    enum: ["structure", "characters", "world_building", "export", "admin", "skills"],
                    description: "The tool category to load",
                },
            },
            required: ["category"],
        },
    },
};

// ─── Public API ─────────────────────────────────────────────────────────────

/** Get all registered tool definitions */
export function getAllTools(): ToolDefinition[] {
    return tools;
}

/** Get tool definitions for the given categories, formatted for OpenAI function calling */
export function getToolDefinitions(categories: ToolCategory[]): OpenAIToolDefinition[] {
    return tools
        .filter((t) => categories.includes(t.category))
        .map((t) => ({
            type: "function" as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: zodToJsonSchema(t.parameters),
            },
        }));
}

/** Get the always-loaded core tools + load_toolset meta-tool, formatted for OpenAI */
export function getCoreTools(): OpenAIToolDefinition[] {
    return [...getToolDefinitions(["core"]), LOAD_TOOLSET_DEFINITION];
}

/** Look up a tool definition by name */
export function getToolByName(name: string): ToolDefinition | undefined {
    return tools.find((t) => t.name === name);
}
