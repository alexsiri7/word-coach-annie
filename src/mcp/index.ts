import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initSnapshotRepo } from "./snapshot";

// Tool implementations
import { listProjects, getProject, createProject, updateProject } from "./tools/projects";
import {
    getOutline,
    createNode,
    updateNode,
    deleteNode,
    readSceneContent,
    writeSceneContent,
    getSceneVersions,
    restoreSceneVersion,
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

// Initialize snapshot repo on startup
try {
    initSnapshotRepo();
} catch (e) {
    console.error("Warning: Could not initialize snapshot repo:", e);
}

const server = new McpServer({
    name: "word-coach-annie",
    version: "1.0.0",
});

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
    "Write new content to a scene. Creates a new version (previous versions are preserved). Content should be HTML formatted (the editor uses Tiptap/ProseMirror).",
    {
        nodeId: z.string().describe("The scene node ID"),
        content: z.string().describe("The HTML content to write"),
    },
    async ({ nodeId, content }) => {
        const result = await writeSceneContent(nodeId, content);
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
    "resolve_annotation",
    "Mark an annotation as resolved (or unresolved).",
    {
        annotationId: z.string().describe("The annotation ID"),
        resolved: z.boolean().describe("Whether the annotation is resolved (true) or open (false)"),
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
        objectId: z.string().describe("The story object ID"),
    },
    async ({ objectId }) => {
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
        const result = await restoreDatabaseSnapshot(commitHash);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
);

// ─── Start server ────────────────────────────────────────────────────────────

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Word Coach Annie MCP server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
