import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SpanStatusCode } from "@opentelemetry/api";
import { initSnapshotRepo } from "./snapshot";
import { listSkills, loadSkill } from "./skills";
import { env } from "@/lib/env";
import { getTracer } from "@/lib/telemetry";
import { logger } from "@/lib/logger";
import { ANNIE_HARD_RULE } from "./annie-voice";
import { REVIEW_SKILL_BY_STATUS } from "@/lib/review-routing";

// Tool implementations
import { listProjects, getProject, createProject, updateProject } from "./tools/projects";
import {
    getOutline,
    createNode,
    updateNode,
    deleteNode,
    readSceneContent,
    writeSceneContent,
    writeSceneContentFromBlocks,
    updateParagraph,
    getSceneVersions,
    restoreSceneVersion,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    resolveAnnotation,
    getOpenAnnotations,
    batchCreateNodes,
    batchUpdateNodes,
    batchDeleteNodes,
} from "./tools/structure";
import {
    listStoryObjects,
    getStoryObject,
    createStoryObject,
    updateStoryObject,
    deleteStoryObject,
    batchCreateStoryObjects,
    batchUpdateStoryObjects,
    batchDeleteStoryObjects,
} from "./tools/story-objects";
import {
    listRelationships,
    createRelationship,
    deleteRelationship,
} from "./tools/relationships";
import {
    exportManuscript,
    exportStoryBible,
    getProjectSummary,
} from "./tools/export";
import {
    snapshotDatabase,
    listDatabaseSnapshots,
    restoreDatabaseSnapshot,
} from "./tools/snapshots";
import {
    listUniverses,
    getUniverse,
    createUniverse,
    updateUniverse,
    deleteUniverse,
    listWorldObjects,
    getWorldObject,
    createWorldObject,
    updateWorldObject,
    deleteWorldObject,
    addTimelineEntry,
    updateTimelineEntry,
    deleteTimelineEntry,
    reorderTimelineEntries,
    transferStoryObjectToUniverse,
    linkProjectToUniverse,
    unlinkProjectFromUniverse,
} from "./tools/universes";
import {
    getPlotThreadStatus,
    getSceneFocus,
    getManuscriptContext,
    getConsistencyContext,
    getVoiceContext,
    getStoryBibleCrossReference,
} from "./tools/coaching";
import { GoogleAuthController } from "../lib/controllers/google-auth";
import { GoogleDocsExporter } from "../lib/export/google-docs-exporter";

// Initialize snapshot repo on startup
try {
    initSnapshotRepo();
} catch (e) {
    console.error("Warning: Could not initialize snapshot repo:", e);
}

interface McpServerOptions {
    /** Allow destructive tools (delete, restore). Default: check MCP_ALLOW_DESTRUCTIVE env var. */
    allowDestructive?: boolean;
    /** Authenticated user ID, extracted from x-user-id header by the MCP route handler. */
    userId?: string | null;
}

// ─── Annie's Voice & Hard Rule ──────────────────────────────────────────────
// Imported from ./annie-voice.ts — single source of truth for both MCP and API routes.

function createServer(options?: McpServerOptions): McpServer {

const allowDestructive = options?.allowDestructive ?? env.MCP_ALLOW_DESTRUCTIVE;
const userId = options?.userId ?? null;

const server = new McpServer({
    name: "word-coach-annie",
    version: "1.0.0",
});

// Instrument all MCP tool handlers with OTEL spans.
// Wraps the original server.tool() so every handler runs inside an `mcp.tool.<name>` span.
const _originalTool = server.tool.bind(server);
server.tool = ((...args: unknown[]) => {
    // server.tool() has multiple overloads; the handler is always the last arg
    // and the tool name is always the first.
    const toolName = args[0] as string;
    const handlerIdx = args.length - 1;
    const originalHandler = args[handlerIdx] as (...a: unknown[]) => Promise<unknown>;

    args[handlerIdx] = async (...handlerArgs: unknown[]) => {
        const tracer = getTracer();
        return tracer.startActiveSpan(`mcp.tool.${toolName}`, async (span) => {
            try {
                span.setAttribute("mcp.tool.name", toolName);
                const result = await originalHandler(...handlerArgs);
                span.setStatus({ code: SpanStatusCode.OK });
                return result;
            } catch (err) {
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: err instanceof Error ? err.message : String(err),
                });
                throw err;
            } finally {
                span.end();
            }
        });
    };

    return (_originalTool as (...a: unknown[]) => unknown)(...args);
}) as typeof server.tool;

/** Guard for destructive tools — returns error if not allowed. */
function destructiveGuard(): { content: [{ type: "text"; text: string }]; isError: true } | null {
    if (!allowDestructive) {
        return {
            content: [{ type: "text", text: "This destructive tool is disabled. Set MCP_ALLOW_DESTRUCTIVE=true to enable." }],
            isError: true,
        };
    }
    return null;
}

// ─── Project Tools ───────────────────────────────────────────────────────────

server.tool(
    "list_projects",
    "List all writing projects with word counts and metadata",
    {
        limit: z.number().optional().describe("Max projects to return (default 20)"),
        offset: z.number().optional().describe("Offset for pagination"),
    },
    async ({ limit, offset }) => {
        const result = await listProjects(limit, offset);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "get_project",
    "Get a single project's details by ID",
    {
        projectId: z.string().describe("The project ID"),
    },
    async ({ projectId }) => {
        const result = await getProject(projectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "create_project",
    "Create a new writing project",
    {
        title: z.string().describe("Project title"),
        author: z.string().optional().describe("Author name"),
        synopsis: z.string().optional().describe("Project synopsis"),
        genre: z.string().optional().describe("Genre"),
    },
    async (params) => {
        const result = await createProject({ ...params, userId });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "update_project",
    "Update a project's metadata (title, author, synopsis, genre). Requires contentHash from get_project to prevent stale overwrites.",
    {
        projectId: z.string().describe("The project ID"),
        contentHash: z.string().describe("The contentHash from get_project — ensures you are updating the version you read"),
        title: z.string().optional().describe("New project title"),
        author: z.string().optional().describe("New author name"),
        synopsis: z.string().optional().describe("New synopsis"),
        genre: z.string().optional().describe("New genre"),
    },
    async ({ projectId, contentHash, title, author, synopsis, genre }) => {
        const result = await updateProject(projectId, { title, author, synopsis, genre }, contentHash);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "reorder_timeline_entries",
    "Reorder timeline entries for a world object",
    {
        worldObjectId: z.string(),
        orderedIds: z.array(z.string()),
    },
    async ({ worldObjectId, orderedIds }: { worldObjectId: string; orderedIds: string[] }) => {
        const result = await reorderTimelineEntries(worldObjectId, orderedIds);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "transfer_story_object_to_universe",
    "Transfer a story object (from a project) into a universe as a world object",
    {
        storyObjectId: z.string(),
        universeId: z.string(),
    },
    async ({ storyObjectId, universeId }: { storyObjectId: string; universeId: string }) => {
        const result = await transferStoryObjectToUniverse(storyObjectId, universeId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "link_project_to_universe",
    "Link a project to a universe",
    {
        projectId: z.string().describe("The project ID"),
        universeId: z.string().describe("The universe ID"),
    },
    async ({ projectId, universeId }) => {
        const result = await linkProjectToUniverse(projectId, universeId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "unlink_project_from_universe",
    "Unlink a project from its universe",
    {
        projectId: z.string().describe("The project ID"),
    },
    async ({ projectId }) => {
        const result = await unlinkProjectFromUniverse(projectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

// ─── Structure & Outline Tools ───────────────────────────────────────────────

server.tool(
    "get_outline",
    "Get the full hierarchical manuscript outline (parts → chapters → scenes) with word counts and statuses",
    {
        projectId: z.string().describe("The project ID"),
    },
    async ({ projectId }) => {
        const result = await getOutline(projectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "create_node",
    "Create a new structure node (PART, CHAPTER, or SCENE) in the manuscript outline",
    {
        projectId: z.string().describe("The project ID"),
        type: z.enum(["PART", "CHAPTER", "SCENE"]).describe("Node type"),
        title: z.string().describe("Node title"),
        parentId: z.string().optional().describe("Parent node ID (required for CHAPTER under PART, SCENE under CHAPTER)"),
        synopsis: z.string().optional().describe("Brief synopsis"),
        status: z.enum(["OUTLINE", "DRAFT", "REVISED", "FINAL"]).optional().describe("Scene status (default OUTLINE)"),
        insertAfterIndex: z.number().optional().describe("Insert after this order index (appends to end if omitted)"),
    },
    async (params) => {
        const result = await createNode(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "update_node",
    "Update a structure node's title, synopsis, status, order, or parent. Requires contentHash from get_outline to prevent stale overwrites.",
    {
        nodeId: z.string().describe("The node ID to update"),
        contentHash: z.string().describe("The contentHash for this node from get_outline — ensures you are updating the version you read"),
        title: z.string().optional().describe("New title"),
        synopsis: z.string().optional().describe("New synopsis"),
        status: z.enum(["OUTLINE", "DRAFT", "REVISED", "FINAL"]).optional().describe("New status"),
        orderIndex: z.number().optional().describe("New order index"),
        parentId: z.string().nullable().optional().describe("New parent node ID (null to make top-level)"),
    },
    async ({ nodeId, contentHash, ...data }) => {
        const result = await updateNode(nodeId, data, contentHash);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "delete_node",
    "Delete a structure node and all its children, content versions, and relationships. A database snapshot is automatically created before deletion.",
    {
        nodeId: z.string().describe("The node ID to delete"),
    },
    async ({ nodeId }) => {
        const guard = destructiveGuard(); if (guard) return guard;
        const result = await deleteNode(nodeId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

// ─── Scene Content Tools ─────────────────────────────────────────────────────

server.tool(
    "read_scene_content",
    "Read the latest content of a scene (returns HTML content, word count, list of annotations, a contentHash for stale-write protection, and a paragraphs array [{index, type, content, contentHash}] for targeted paragraph updates via update_paragraph)",
    {
        nodeId: z.string().describe("The scene node ID"),
    },
    async ({ nodeId }) => {
        const result = await readSceneContent(nodeId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "write_scene_content",
    "Write new content to a scene. Provide either 'content' (HTML string for author-written prose) or 'blocks' (structured beat array). Annie should ONLY use 'blocks' with type BEAT — never produce CONTENT blocks or raw HTML prose. Creates a new version. Requires contentHash from read_scene_content to prevent stale overwrites.",
    {
        nodeId: z.string().describe("The scene node ID"),
        contentHash: z.string().describe("The contentHash from read_scene_content — ensures you are writing over the version you read"),
        content: z.string().optional().describe("The HTML content to write"),
        blocks: z.array(z.object({
            type: z.enum(["CONTENT", "BEAT"]),
            content: z.string()
        })).optional().describe("Structured content blocks")
    },
    async ({ nodeId, contentHash, content, blocks }) => {
        if (blocks) {
            const hasContentBlock = blocks.some(b => b.type === "CONTENT");
            if (hasContentBlock) {
                logger.warn("write_scene_content: CONTENT block rejected by Annie guardrail", { nodeId });
                return {
                    content: [{
                        type: "text",
                        text: "Oh no no no. That part is yours. I will sit here and I will WAIT — but I am not writing your scene for you. Do you want to talk through what needs to happen? I can map it as beats.",
                    }],
                    isError: true,
                };
            }
            const result = await writeSceneContentFromBlocks(nodeId, blocks as { type: "CONTENT" | "BEAT"; content: string }[], contentHash);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        if (content !== undefined) {
            const result = await writeSceneContent(nodeId, content, contentHash);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        throw new Error("Either 'content' or 'blocks' must be provided");
    }
);

server.tool(
    "update_paragraph",
    "Patch a single paragraph or beat within a scene by its index (from read_scene_content paragraphs array). Requires paragraphContentHash from the paragraph entry to prevent stale overwrites. Optionally also accepts sceneContentHash for scene-level stale detection.",
    {
        nodeId: z.string().describe("The scene node ID"),
        index: z.number().int().describe("The paragraph index from the paragraphs array"),
        content: z.string().describe("New content for this paragraph (must match the existing type — CONTENT or BEAT)"),
        paragraphContentHash: z.string().describe("The contentHash from the paragraphs[index] entry in read_scene_content"),
        sceneContentHash: z.string().optional().describe("Optional scene-level contentHash from read_scene_content for additional stale protection"),
    },
    async ({ nodeId, index, content, paragraphContentHash, sceneContentHash }) => {
        const result = await updateParagraph(nodeId, index, content, paragraphContentHash, sceneContentHash);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "get_scene_versions",
    "List the version history of a scene (timestamps and word counts)",
    {
        nodeId: z.string().describe("The scene node ID"),
        limit: z.number().optional().describe("Max versions to return (default 20)"),
    },
    async ({ nodeId, limit }) => {
        const result = await getSceneVersions(nodeId, limit);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "restore_scene_version",
    "Restore a previous version of a scene's content. Creates a new version from the old content (non-destructive).",
    {
        nodeId: z.string().describe("The scene node ID"),
        versionId: z.string().describe("The version ID to restore"),
    },
    async ({ nodeId, versionId }) => {
        const result = await restoreSceneVersion(nodeId, versionId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "add_annotation",
    "Add an annotation to a node",
    {
        nodeId: z.string(),
        content: z.string(),
        range: z.string().optional(),
        selectedText: z.string().optional(),
    },
    async ({ nodeId, content, range, selectedText }: { nodeId: string; content: string; range?: string; selectedText?: string }) => {
        const result = await addAnnotation(nodeId, content, range, selectedText);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "update_annotation",
    "Update an existing annotation",
    {
        annotationId: z.string(),
        content: z.string().optional(),
        resolved: z.boolean().optional(),
    },
    async ({ annotationId, ...data }) => {
        const result = await updateAnnotation(annotationId, data);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "delete_annotation",
    "Delete an annotation",
    {
        annotationId: z.string(),
    },
    async ({ annotationId }) => {
        const guard = destructiveGuard(); if (guard) return guard;
        const result = await deleteAnnotation(annotationId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "resolve_annotation",
    "Resolve or unresolve an annotation",
    {
        annotationId: z.string(),
        resolved: z.boolean(),
    },
    async ({ annotationId, resolved }) => {
        const result = await resolveAnnotation(annotationId, resolved);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "get_open_annotations",
    "Get all unresolved annotations across the project (or filtered by project ID). Useful as an inbox of tasks.",
    {
        projectId: z.string().optional().describe("Optional project ID to filter by. If omitted, returns all open annotations in the database."),
    },
    async ({ projectId }) => {
        const result = await getOpenAnnotations(projectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

// ─── Story Object Tools ──────────────────────────────────────────────────────

server.tool(
    "list_story_objects",
    "List story objects (characters, locations, plotlines, world elements, notes) with optional filtering",
    {
        projectId: z.string().describe("The project ID"),
        type: z.enum(["CHARACTER", "LOCATION", "PLOTLINE", "WORLD_ELEMENT", "NOTE"]).optional().describe("Filter by type"),
        search: z.string().optional().describe("Search by name (case-insensitive contains)"),
        limit: z.number().optional().describe("Max objects to return (default 50)"),
        offset: z.number().optional().describe("Offset for pagination"),
    },
    async (params) => {
        const result = await listStoryObjects(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "get_story_object",
    "Get a single story object with all its details and relationships",
    {
        objectId: z.string(),
    },
    async ({ objectId }: { objectId: string }) => {
        const result = await getStoryObject(objectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "create_story_object",
    "Create a new story object (character, location, plotline, world element, or note)",
    {
        projectId: z.string().describe("The project ID"),
        type: z.enum(["CHARACTER", "LOCATION", "PLOTLINE", "WORLD_ELEMENT", "NOTE"]).describe("Object type"),
        name: z.string().describe("Object name"),
        description: z.string().optional().describe("Description"),
        notes: z.string().optional().describe("Additional notes"),
        role: z.string().optional().describe("Role (for characters: protagonist, antagonist, supporting, minor)"),
        tags: z.string().optional().describe("Comma-separated tags"),
    },
    async (params) => {
        const result = await createStoryObject(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "update_story_object",
    "Update a story object's fields (name, description, notes, role, tags). Requires contentHash from get_story_object to prevent stale overwrites.",
    {
        objectId: z.string().describe("The story object ID"),
        contentHash: z.string().describe("The contentHash from get_story_object — ensures you are updating the version you read"),
        name: z.string().optional().describe("New name"),
        description: z.string().optional().describe("New description"),
        notes: z.string().optional().describe("New notes"),
        role: z.string().nullable().optional().describe("New role (null to clear)"),
        tags: z.string().optional().describe("New comma-separated tags"),
    },
    async ({ objectId, contentHash, ...data }) => {
        const result = await updateStoryObject(objectId, data, contentHash);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "delete_story_object",
    "Delete a story object and all its relationships. A database snapshot is automatically created before deletion.",
    {
        objectId: z.string().describe("The story object ID to delete"),
    },
    async ({ objectId }) => {
        const guard = destructiveGuard(); if (guard) return guard;
        const result = await deleteStoryObject(objectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

// ─── Batch Tools ────────────────────────────────────────────────────────────

server.tool(
    "batch_create_story_objects",
    "Create multiple story objects in a single operation. Returns per-item results with successes and errors. Max 50 per batch.",
    {
        projectId: z.string().describe("The project ID"),
        objects: z.array(z.object({
            type: z.enum(["CHARACTER", "LOCATION", "PLOTLINE", "WORLD_ELEMENT", "NOTE"]).describe("Object type"),
            name: z.string().describe("Object name"),
            description: z.string().optional().describe("Description"),
            notes: z.string().optional().describe("Additional notes"),
            role: z.string().optional().describe("Role (for characters)"),
            tags: z.string().optional().describe("Comma-separated tags"),
        })).describe("Array of story objects to create"),
    },
    async ({ projectId, objects }) => {
        const result = await batchCreateStoryObjects(projectId, objects);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "batch_update_story_objects",
    "Update multiple story objects in a single operation. Returns per-item results with successes and errors. Max 50 per batch.",
    {
        updates: z.array(z.object({
            objectId: z.string().describe("The story object ID"),
            name: z.string().optional().describe("New name"),
            description: z.string().optional().describe("New description"),
            notes: z.string().optional().describe("New notes"),
            role: z.string().nullable().optional().describe("New role (null to clear)"),
            tags: z.string().optional().describe("New comma-separated tags"),
        })).describe("Array of updates to apply"),
    },
    async ({ updates }) => {
        const result = await batchUpdateStoryObjects(updates);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "batch_delete_story_objects",
    "Delete multiple story objects and their relationships in a single operation. A snapshot is created before deletion. Max 50 per batch.",
    {
        objectIds: z.array(z.string()).describe("Array of story object IDs to delete"),
    },
    async ({ objectIds }) => {
        const guard = destructiveGuard(); if (guard) return guard;
        const result = await batchDeleteStoryObjects(objectIds);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "batch_create_nodes",
    "Create multiple structure nodes (PART, CHAPTER, SCENE) in a single operation. Nodes are created sequentially, so earlier entries can serve as parents for later ones. Max 50 per batch.",
    {
        projectId: z.string().describe("The project ID"),
        nodes: z.array(z.object({
            type: z.enum(["PART", "CHAPTER", "SCENE"]).describe("Node type"),
            title: z.string().describe("Node title"),
            parentId: z.string().optional().describe("Parent node ID"),
            synopsis: z.string().optional().describe("Brief synopsis"),
            status: z.enum(["OUTLINE", "DRAFT", "REVISED", "FINAL"]).optional().describe("Scene status (default OUTLINE)"),
        })).describe("Array of nodes to create"),
    },
    async ({ projectId, nodes }) => {
        const result = await batchCreateNodes(projectId, nodes);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "batch_update_nodes",
    "Update multiple structure nodes in a single operation. Returns per-item results with successes and errors. Max 50 per batch.",
    {
        updates: z.array(z.object({
            nodeId: z.string().describe("The node ID to update"),
            title: z.string().optional().describe("New title"),
            synopsis: z.string().optional().describe("New synopsis"),
            status: z.enum(["OUTLINE", "DRAFT", "REVISED", "FINAL"]).optional().describe("New status"),
            orderIndex: z.number().optional().describe("New order index"),
            parentId: z.string().nullable().optional().describe("New parent node ID (null to make top-level)"),
        })).describe("Array of updates to apply"),
    },
    async ({ updates }) => {
        const result = await batchUpdateNodes(updates);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "batch_delete_nodes",
    "Delete multiple structure nodes and their children in a single operation. A snapshot is created before deletion. Max 50 per batch.",
    {
        nodeIds: z.array(z.string()).describe("Array of node IDs to delete"),
    },
    async ({ nodeIds }) => {
        const guard = destructiveGuard(); if (guard) return guard;
        const result = await batchDeleteNodes(nodeIds);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

// ─── Relationship Tools ──────────────────────────────────────────────────────

server.tool(
    "list_relationships",
    "List all relationships in a project (character appears in scene, location contains element, etc.)",
    {
        projectId: z.string().describe("The project ID"),
    },
    async ({ projectId }) => {
        const result = await listRelationships(projectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "create_relationship",
    "Create a typed relationship between two entities. Provide exactly one from-field and one to-field.",
    {
        projectId: z.string().describe("The project ID (for validation)"),
        type: z.enum(["APPEARS_IN", "LOCATED_AT", "PART_OF_PLOTLINE", "RELATED_TO", "INTERACTS_WITH", "CONTAINS", "PRECEDES", "FOLLOWS"]).describe("Relationship type"),
        fromNodeId: z.string().optional().describe("Source structure node ID"),
        fromObjectId: z.string().optional().describe("Source story object ID"),
        toNodeId: z.string().optional().describe("Target structure node ID"),
        toObjectId: z.string().optional().describe("Target story object ID"),
        label: z.string().optional().describe("Optional label/description for the relationship"),
    },
    async (params) => {
        const result = await createRelationship(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "delete_relationship",
    "Delete a relationship between two entities. A database snapshot is automatically created before deletion.",
    {
        relationshipId: z.string().describe("The relationship ID to delete"),
    },
    async ({ relationshipId }) => {
        const guard = destructiveGuard(); if (guard) return guard;
        const result = await deleteRelationship(relationshipId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

// ─── Export & Summary Tools ──────────────────────────────────────────────────

server.tool(
    "export_manuscript",
    "Export the full manuscript as clean Markdown (front matter + parts/chapters/scenes). Returns the full text.",
    {
        projectId: z.string().describe("The project ID"),
    },
    async ({ projectId }) => {
        const markdown = await exportManuscript(projectId);
        return { content: [{ type: "text", text: markdown }] };
    }
);

server.tool(
    "export_story_bible",
    "Export the story bible as Markdown (all characters, locations, plotlines, world elements, relationships)",
    {
        projectId: z.string().describe("The project ID"),
    },
    async ({ projectId }) => {
        const markdown = await exportStoryBible(projectId);
        return { content: [{ type: "text", text: markdown }] };
    }
);

server.tool(
    "export_hashnode",
    "Export a specific node (Article/Chapter) or the entire project in Hashnode-ready Markdown format (with front matter)",
    {
        projectId: z.string().describe("The project ID"),
        nodeId: z.string().optional().describe("The specific node ID to export (e.g. an Article ID). If omitted, exports all."),
    },
    async ({ projectId, nodeId }) => {
        const { exportHashnode } = await import("./tools/export");
        const markdown = await exportHashnode(projectId, nodeId);
        return { content: [{ type: "text", text: markdown }] };
    }
);

server.tool(
    "get_project_summary",
    "Get a structured overview of a project: metadata, node counts by type/status, story object counts by type, total word count",
    {
        projectId: z.string().describe("The project ID"),
    },
    async ({ projectId }) => {
        const result = await getProjectSummary(projectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

// ─── Database Safety Tools ───────────────────────────────────────────────────

server.tool(
    "snapshot_database",
    "Create a named snapshot (git commit) of the current database state. Use this before making significant changes as a safety checkpoint.",
    {
        message: z.string().describe("Description of what's about to change or why you're taking this snapshot"),
    },
    async ({ message }) => {
        const result = await snapshotDatabase(message);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "list_snapshots",
    "List recent database snapshots (git commits) with timestamps and messages",
    {
        limit: z.number().optional().describe("Max snapshots to return (default 20)"),
    },
    async ({ limit }) => {
        const result = await listDatabaseSnapshots(limit);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "restore_snapshot",
    "Restore the database to a previous snapshot. Creates a new snapshot of the restored state. WARNING: This replaces the current database contents.",
    {
        commitHash: z.string().describe("The snapshot commit hash to restore (from list_snapshots)"),
    },
    async ({ commitHash }) => {
        const guard = destructiveGuard(); if (guard) return guard;
        const result = await restoreDatabaseSnapshot(commitHash);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

// ─── Universe Tools ──────────────────────────────────────────────────────────

server.tool(
    "list_universes",
    "List all universes",
    {},
    async () => {
        const result = await listUniverses();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "get_universe",
    "Get a universe by ID with its world objects and linked projects",
    {
        universeId: z.string().describe("The universe ID"),
    },
    async ({ universeId }) => {
        const result = await getUniverse(universeId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "create_universe",
    "Create a new universe",
    {
        title: z.string().describe("Universe title"),
        description: z.string().optional().describe("Universe description"),
    },
    async (params) => {
        const result = await createUniverse(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "update_universe",
    "Update a universe's metadata. Requires contentHash from get_universe to prevent stale overwrites.",
    {
        universeId: z.string().describe("The universe ID"),
        contentHash: z.string().describe("The contentHash from get_universe — ensures you are updating the version you read"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
    },
    async ({ universeId, contentHash, ...data }) => {
        const result = await updateUniverse(universeId, data, contentHash);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "delete_universe",
    "Delete a universe and all its world objects and timeline entries",
    {
        universeId: z.string().describe("The universe ID"),
    },
    async ({ universeId }) => {
        const guard = destructiveGuard(); if (guard) return guard;
        const result = await deleteUniverse(universeId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "list_world_objects",
    "List world objects in a universe",
    {
        universeId: z.string().describe("The universe ID"),
        type: z.string().optional().describe("Filter by type (CHARACTER, LOCATION, WORLD_ELEMENT)"),
    },
    async ({ universeId, type }) => {
        const result = await listWorldObjects(universeId, type);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "get_world_object",
    "Get a world object by ID with its full timeline",
    {
        objectId: z.string().describe("The world object ID"),
    },
    async ({ objectId }) => {
        const result = await getWorldObject(objectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "create_world_object",
    "Create a new world object in a universe",
    {
        universeId: z.string().describe("The universe ID"),
        type: z.enum(["CHARACTER", "LOCATION", "WORLD_ELEMENT"]).describe("Object type"),
        name: z.string().describe("Object name"),
        description: z.string().optional().describe("Description"),
        notes: z.string().optional().describe("Additional notes"),
        tags: z.string().optional().describe("Comma-separated tags"),
    },
    async (params) => {
        const result = await createWorldObject(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "update_world_object",
    "Update a world object's fields. Requires contentHash from get_world_object to prevent stale overwrites.",
    {
        objectId: z.string().describe("The world object ID"),
        contentHash: z.string().describe("The contentHash from get_world_object — ensures you are updating the version you read"),
        name: z.string().optional().describe("New name"),
        description: z.string().optional().describe("New description"),
        notes: z.string().optional().describe("New notes"),
        tags: z.string().optional().describe("New tags"),
        type: z.string().optional().describe("New type"),
    },
    async ({ objectId, contentHash, ...data }) => {
        const result = await updateWorldObject(objectId, data, contentHash);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "delete_world_object",
    "Delete a world object and its timeline",
    {
        objectId: z.string().describe("The world object ID"),
    },
    async ({ objectId }) => {
        const guard = destructiveGuard(); if (guard) return guard;
        const result = await deleteWorldObject(objectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "add_timeline_entry",
    "Add a state-history entry to a world object's timeline. Timeline entries track how an object changes over story time (e.g. 'Year 12 — apprenticed to the blacksmith'). Use this to record key life events, status changes, or turning points so Annie can check consistency across scenes set at different points in the story.",
    {
        worldObjectId: z.string().describe("The world object ID"),
        label: z.string().describe("Period or event label (e.g. 'Year 12', 'Post-War', 'Age 20')"),
        description: z.string().optional().describe("What is true about this object at this point in story time"),
        attributes: z.string().optional().describe("JSON blob for structured data"),
        projectId: z.string().optional().describe("Optional project ID this entry relates to"),
        orderIndex: z.number().optional().describe("Order index (appends to end if omitted)"),
    },
    async (params) => {
        const result = await addTimelineEntry(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "update_timeline_entry",
    "Update a world object's timeline entry. Timeline entries are state-history records tracking how an object changes over story time — use this to correct or expand what is true about the object at a given period. Requires contentHash from get_world_object (the entry's contentHash in the timeline array) to prevent stale overwrites.",
    {
        entryId: z.string().describe("The entry ID"),
        contentHash: z.string().describe("The contentHash for this entry from get_world_object's timeline array — ensures you are updating the version you read"),
        label: z.string().optional().describe("New period or event label"),
        description: z.string().optional().describe("Updated description of what is true at this point"),
        attributes: z.string().optional().describe("New JSON blob"),
        orderIndex: z.number().optional().describe("New order index"),
    },
    async ({ entryId, contentHash, ...data }) => {
        const result = await updateTimelineEntry(entryId, data, contentHash);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "delete_timeline_entry",
    "Delete a state-history entry from a world object's timeline",
    {
        entryId: z.string().describe("The entry ID"),
    },
    async ({ entryId }) => {
        const guard = destructiveGuard(); if (guard) return guard;
        const result = await deleteTimelineEntry(entryId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

// ─── Google Docs Tools ───────────────────────────────────────────────────────

server.tool(
    "google_auth_status",
    "Check if Google credentials are configured and valid",
    {},
    async () => {
        const status = await GoogleAuthController.getStatus();
        return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    }
);

server.tool(
    "google_auth_connect",
    "Initiate OAuth flow; returns auth URL for the user to visit",
    {},
    async () => {
        try {
            const url = GoogleAuthController.getAuthUrl(env.GOOGLE_REDIRECT_URI ?? '');
            return { content: [{ type: "text", text: `Please visit this URL to authorize: ${url}` }] };
        } catch (e) {
            logger.error("google_auth_connect: failed to generate auth URL", e);
            const message = e instanceof Error ? e.message : String(e);
            return { content: [{ type: "text", text: `Error generating auth URL. Check environment variables (GOOGLE_CLIENT_ID, etc). Error: ${message}` }], isError: true };
        }
    }
);

server.tool(
    "google_auth_callback",
    "Complete OAuth flow with the authorization code",
    {
        code: z.string().describe("The authorization code from the redirect URL"),
    },
    async ({ code }) => {
        try {
            await GoogleAuthController.handleCallback(code, env.GOOGLE_REDIRECT_URI ?? '');
            return { content: [{ type: "text", text: "Successfully connected to Google!" }] };
        } catch (e) {
            logger.error("google_auth_callback: failed to complete OAuth flow", e);
            const message = e instanceof Error ? e.message : String(e);
            return { content: [{ type: "text", text: `Error connecting: ${message}` }], isError: true };
        }
    }
);

server.tool(
    "google_auth_disconnect",
    "Revoke and delete stored Google credentials",
    {},
    async () => {
        const guard = destructiveGuard(); if (guard) return guard;
        await GoogleAuthController.disconnect();
        return { content: [{ type: "text", text: "Disconnected from Google." }] };
    }
);

server.tool(
    "export_to_google_docs",
    "Export/sync a project or universe to Google Docs. Creates a new doc or updates existing one.",
    {
        projectId: z.string().optional().describe("Project ID to export"),
        universeId: z.string().optional().describe("Universe ID to export"),
        exportMode: z.enum(['UNIVERSE', 'STORY_INTERNAL', 'STORY_READER']).describe("Export mode"),
    },
    async ({ projectId, universeId, exportMode }) => {
        if (!projectId && !universeId) {
            return { content: [{ type: "text", text: "Either projectId or universeId must be provided." }], isError: true };
        }
        if (exportMode === 'UNIVERSE' && !universeId) {
            return { content: [{ type: "text", text: "universeId is required for UNIVERSE mode." }], isError: true };
        }
        if (exportMode !== 'UNIVERSE' && !projectId) {
            return { content: [{ type: "text", text: "projectId is required for STORY modes." }], isError: true };
        }

        try {
            const entityId = exportMode === 'UNIVERSE' ? universeId! : projectId!;
            const result = await GoogleDocsExporter.exportToGoogleDocs(entityId, exportMode as "UNIVERSE" | "STORY_INTERNAL" | "STORY_READER");
            return { content: [{ type: "text", text: `Export successful! Document: ${result.googleDocUrl}` }] };
        } catch (e) {
            logger.error("export_to_google_docs: export failed", e);
            const message = e instanceof Error ? e.message : String(e);
            return { content: [{ type: "text", text: `Export failed: ${message}` }], isError: true };
        }
    }
);

// ─── Coaching & Analysis Tools ───────────────────────────────────────────────

server.tool(
    "get_plot_thread_status",
    "Track plotline engagement across scenes. Shows which plot threads are advancing, newly mentioned, or dormant in each scene — essential for spotting dropped threads.",
    {
        projectId: z.string().describe("The project ID"),
    },
    async ({ projectId }) => {
        const result = await getPlotThreadStatus(projectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "get_scene_focus",
    "Get complete context for coaching on a single scene: scene metadata, status, word count, adjacent scenes, linked characters/locations/plotlines, and open annotations.",
    {
        sceneId: z.string().describe("The scene node ID"),
    },
    async ({ sceneId }) => {
        const result = await getSceneFocus(sceneId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "get_manuscript_context",
    "Get the full manuscript context for analysis: outline with scene previews, character profiles, plotline summaries, and relationships. Use this before running manuscript-level analysis.",
    {
        projectId: z.string().describe("The project ID"),
    },
    async ({ projectId }) => {
        const result = await getManuscriptContext(projectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "get_consistency_context",
    "Gather character profiles and scene text for consistency analysis. Optionally focus on a single scene. Returns structured data ready for identifying contradictions.",
    {
        projectId: z.string().describe("The project ID"),
        sceneId: z.string().optional().describe("Focus on a specific scene (if omitted, checks up to 20 scenes)"),
    },
    async ({ projectId, sceneId }) => {
        const result = await getConsistencyContext(projectId, sceneId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "cross_reference_story_bible",
    "Cross-reference prose content against story object definitions. Returns all story objects (characters, locations, world elements, plotlines) with full details alongside scene text and relationship mappings. Use this to find attribute mismatches, behavioural inconsistencies, and timeline contradictions between what the story bible defines and what the prose actually says. Includes instructions for presenting mismatches and confirmation flow.",
    {
        projectId: z.string().describe("The project ID"),
        sceneId: z.string().optional().describe("Focus on a specific scene (if omitted, checks up to 15 scenes)"),
    },
    async ({ projectId, sceneId }) => {
        const result = await getStoryBibleCrossReference(projectId, sceneId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "get_voice_context",
    "Gather character profiles and scene dialogue for voice consistency analysis. Returns characters linked to the scene with their descriptions and the scene text.",
    {
        projectId: z.string().describe("The project ID"),
        sceneId: z.string().describe("The scene to analyze"),
    },
    async ({ projectId, sceneId }) => {
        const result = await getVoiceContext(projectId, sceneId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

// ─── Coaching Prompts ───────────────────────────────────────────────────────

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

// ─── Review Routing (Status-Aware Skill Dispatch) ──────────────────────────

type SceneFocus = Awaited<ReturnType<typeof getSceneFocus>>;

function _makeProjectReviewPrompt(projectId: string, modeTitle: string, instructions: string) {
    return {
        messages: [{
            role: "user" as const,
            content: {
                type: "text" as const,
                text: `${ANNIE_HARD_RULE}Project ID: ${projectId}\n\n## Review Mode: ${modeTitle}\n\nUse the \`export_manuscript\` tool with this project ID to load the full manuscript text.\n\nThen apply this review lens:\n\n${instructions}\n\nAfter your initial review, stay in conversation — answer follow-up questions and go deeper on any area the writer wants to explore.`,
            },
        }],
    };
}

server.prompt(
    "review",
    "Context-aware scene review — automatically routes to the right skill based on scene status (OUTLINE→outline review, DRAFT→developmental edit, REVISED→line edit, FINAL→consistency check).",
    {
        sceneId: z.string().describe("The scene node ID to review"),
        projectId: z.string().optional().describe("The project ID (auto-detected from scene if omitted)"),
    },
    async (args) => {
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

**Step 3: Present findings with confirmation flow.**
For each story bible vs prose mismatch, present both versions and ask which is the source of truth:
- **A) Update story object** → use \`update_story_object\` to sync bible to prose
- **B) Flag scene** → use \`add_annotation\` to mark prose for revision
- **C) Keep both** → intentional difference, no action needed

IMPORTANT: Never silently overwrite. Always ask before making changes.
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

// ─── Review Persona Prompts ─────────────────────────────────────────────────

server.prompt(
    "review-editor",
    "Review manuscript as a seasoned acquisitions editor — commercial viability, hook strength, pacing, character arc payoff.",
    { projectId: z.string().describe("The project ID to review") },
    async (args) => ({
        messages: [{
            role: "user" as const,
            content: {
                type: "text" as const,
                text: `${ANNIE_HARD_RULE}Project ID: ${args.projectId}\n\n## Review Mode: Acquisitions Editor\n\nUse the \`export_manuscript\` tool with this project ID to load the full manuscript text.\n\nThen apply this review lens:\n\nYou are a seasoned acquisitions editor evaluating this project for publication. Be direct, professional, and commercially minded.\n\nYour focus: narrative structure, pacing, opening hook, character arc payoff, thematic clarity, and publication readiness. Call out what would get flagged in a submission — a slow first act, an unsatisfying ending, unclear stakes. Be specific: quote short passages when you flag something.\n\nTone: A senior editor giving notes. Encouraging where warranted, blunt where necessary. "This works because..." and "This needs work because..." — no vague praise or vague criticism.\n\nAfter your initial review, stay in conversation — answer follow-up questions and go deeper on any area the writer wants to explore.`,
            },
        }],
    })
);

server.prompt(
    "review-fan",
    "Review manuscript as an avid genre reader — visceral reader response, emotional reactions, genre expectations.",
    { projectId: z.string().describe("The project ID to review") },
    async (args) => ({
        messages: [{
            role: "user" as const,
            content: {
                type: "text" as const,
                text: `${ANNIE_HARD_RULE}Project ID: ${args.projectId}\n\n## Review Mode: Fan Reader\n\nUse the \`export_manuscript\` tool with this project ID to load the full manuscript text.\n\nThen apply this review lens:\n\nYou are an avid fan of this genre who just finished reading this project. React like a real reader — enthusiastic, personal, opinionated.\n\nYour focus: did it hook you, did it hold you, did the ending satisfy? Did it deliver what the genre promises? What made you lean forward, what made you put it down? Talk about specific moments: "I loved when...", "I lost the thread at...", "I didn't buy the part where..."\n\nTone: Enthusiastic and honest, like a book club conversation. Not academic — visceral reader response. You're allowed to gush AND to be disappointed.\n\nAfter your initial review, stay in conversation — answer follow-up questions and go deeper on any area the writer wants to explore.`,
            },
        }],
    })
);

server.prompt(
    "review-author",
    "Review manuscript as a published peer author — craft-level feedback on prose, POV, dialogue, scene construction.",
    { projectId: z.string().describe("The project ID to review") },
    async (args) => ({
        messages: [{
            role: "user" as const,
            content: {
                type: "text" as const,
                text: `${ANNIE_HARD_RULE}Project ID: ${args.projectId}\n\n## Review Mode: Peer Author\n\nUse the \`export_manuscript\` tool with this project ID to load the full manuscript text.\n\nThen apply this review lens:\n\nYou are a published author in the same genre, giving craft-level peer feedback.\n\nYour focus: prose sentence by sentence — is the rhythm working? POV discipline — any slips? Dialogue — does it sound like people or plot delivery? Scene construction — is each scene doing two things? Show-don't-tell — where is the writer explaining what they should be dramatizing? Inciting incident timing. Tension mechanics.\n\nTone: Technical and collegial. "The inciting incident lands two scenes late — here's why that matters." "This POV slip undercuts the tension you built." Treat the writer as a fellow craftsperson who can handle real notes.\n\nAfter your initial review, stay in conversation — answer follow-up questions and go deeper on any area the writer wants to explore.`,
            },
        }],
    })
);

// ─── Skills Tool ─────────────────────────────────────────────────────────────

server.tool(
    "list_skills",
    "List all available writing skills (structured instruction sets for writing tasks like developmental editing, line editing, etc). Use get_prompt to invoke a skill.",
    {},
    async () => {
        const skills = listSkills();
        return { content: [{ type: "text", text: JSON.stringify(skills, null, 2) }] };
    }
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

return server;

} // end createServer

export { createServer };
