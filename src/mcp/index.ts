import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { initSnapshotRepo } from "./snapshot";
import { listSkills, loadSkill } from "./skills";
import { env } from "@/lib/env";

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
    getSceneVersions,
    restoreSceneVersion,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    resolveAnnotation,
    getOpenAnnotations,
} from "./tools/structure";
import {
    listStoryObjects,
    getStoryObject,
    createStoryObject,
    updateStoryObject,
    deleteStoryObject,
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
}

function createServer(options?: McpServerOptions): McpServer {

const allowDestructive = options?.allowDestructive ?? env.MCP_ALLOW_DESTRUCTIVE;

const server = new McpServer({
    name: "word-coach-annie",
    version: "1.0.0",
});

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
        const result = await createProject(params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "update_project",
    "Update a project's metadata (title, author, synopsis, genre)",
    {
        projectId: z.string().describe("The project ID"),
        title: z.string().optional().describe("New project title"),
        author: z.string().optional().describe("New author name"),
        synopsis: z.string().optional().describe("New synopsis"),
        genre: z.string().optional().describe("New genre"),
    },
    async ({ projectId, title, author, synopsis, genre }) => {
        const result = await updateProject(projectId, { title, author, synopsis, genre });
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
    "Update a structure node's title, synopsis, status, order, or parent",
    {
        nodeId: z.string().describe("The node ID to update"),
        title: z.string().optional().describe("New title"),
        synopsis: z.string().optional().describe("New synopsis"),
        status: z.enum(["OUTLINE", "DRAFT", "REVISED", "FINAL"]).optional().describe("New status"),
        orderIndex: z.number().optional().describe("New order index"),
        parentId: z.string().nullable().optional().describe("New parent node ID (null to make top-level)"),
    },
    async ({ nodeId, ...data }) => {
        const result = await updateNode(nodeId, data);
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
    "Read the latest content of a scene (returns HTML content, word count, and list of annotations)",
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
    "Write new content to a scene. Provide either 'content' (HTML string) or 'blocks' (structured content/beat array). Creates a new version.",
    {
        nodeId: z.string().describe("The scene node ID"),
        content: z.string().optional().describe("The HTML content to write"),
        blocks: z.array(z.object({
            type: z.enum(["CONTENT", "BEAT"]),
            content: z.string()
        })).optional().describe("Structured content blocks")
    },
    async ({ nodeId, content, blocks }) => {
        if (blocks) {
            const result = await writeSceneContentFromBlocks(nodeId, blocks as { type: "CONTENT" | "BEAT"; content: string }[]);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        if (content !== undefined) {
            const result = await writeSceneContent(nodeId, content);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        throw new Error("Either 'content' or 'blocks' must be provided");
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
    "Update a story object's fields (name, description, notes, role, tags)",
    {
        objectId: z.string().describe("The story object ID"),
        name: z.string().optional().describe("New name"),
        description: z.string().optional().describe("New description"),
        notes: z.string().optional().describe("New notes"),
        role: z.string().nullable().optional().describe("New role (null to clear)"),
        tags: z.string().optional().describe("New comma-separated tags"),
    },
    async ({ objectId, ...data }) => {
        const result = await updateStoryObject(objectId, data);
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
    "export_medium",
    "Export a specific node (Article/Chapter) or the entire project in Medium-ready Markdown format (with front matter)",
    {
        projectId: z.string().describe("The project ID"),
        nodeId: z.string().optional().describe("The specific node ID to export (e.g. an Article ID). If omitted, exports all."),
    },
    async ({ projectId, nodeId }) => {
        const { exportMedium } = await import("./tools/export");
        const markdown = await exportMedium(projectId, nodeId);
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
    "Update a universe's metadata",
    {
        universeId: z.string().describe("The universe ID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
    },
    async ({ universeId, ...data }) => {
        const result = await updateUniverse(universeId, data);
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
    "Update a world object's fields",
    {
        objectId: z.string().describe("The world object ID"),
        name: z.string().optional().describe("New name"),
        description: z.string().optional().describe("New description"),
        notes: z.string().optional().describe("New notes"),
        tags: z.string().optional().describe("New tags"),
        type: z.string().optional().describe("New type"),
    },
    async ({ objectId, ...data }) => {
        const result = await updateWorldObject(objectId, data);
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
    "Add a timeline entry to a world object",
    {
        worldObjectId: z.string().describe("The world object ID"),
        label: z.string().describe("Entry label (e.g. 'Birth')"),
        description: z.string().optional().describe("Detailed description"),
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
    "Update a timeline entry",
    {
        entryId: z.string().describe("The entry ID"),
        label: z.string().optional().describe("New label"),
        description: z.string().optional().describe("New description"),
        attributes: z.string().optional().describe("New JSON blob"),
        orderIndex: z.number().optional().describe("New order index"),
    },
    async ({ entryId, ...data }) => {
        const result = await updateTimelineEntry(entryId, data);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

server.tool(
    "delete_timeline_entry",
    "Delete a timeline entry",
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
            const url = GoogleAuthController.getAuthUrl();
            return { content: [{ type: "text", text: `Please visit this URL to authorize: ${url}` }] };
        } catch (e) {
            return { content: [{ type: "text", text: `Error generating auth URL. Check environment variables (GOOGLE_CLIENT_ID, etc). Error: ${e}` }], isError: true };
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
            await GoogleAuthController.handleCallback(code);
            return { content: [{ type: "text", text: "Successfully connected to Google!" }] };
        } catch (e) {
            return { content: [{ type: "text", text: `Error connecting: ${e}` }], isError: true };
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
            return { content: [{ type: "text", text: `Export failed: ${e}` }], isError: true };
        }
    }
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
                            text: contextHeader + skill.instructions,
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
