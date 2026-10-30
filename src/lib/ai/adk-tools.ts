/**
 * ADK tool definitions — the single source of truth for tool schemas, categories,
 * and execution handlers. Uses Google ADK FunctionTool instances with Zod schemas
 * for automatic JSON schema generation.
 *
 * The category-based dynamic loading (load_toolset) is preserved via a custom
 * BaseToolset implementation that the ADK agent uses.
 */
import { FunctionTool, BaseToolset } from "@google/adk";
import type { BaseTool, ToolPredicate, ToolInputParameters } from "@google/adk";
import type { ReadonlyContext } from "@google/adk";
import { z, ZodObject, ZodRawShape } from "zod";
import { NodeOrderIndex } from "@/schemas/nodes";
import { ContentHash } from "@/schemas/content-hash";
import { SpanStatusCode } from "@opentelemetry/api";
import { getTracer } from "@/lib/telemetry";

// ADK bundles its own zod v3 copy. The project's zod is structurally identical
// but TypeScript treats them as separate types due to private fields. We cast
// through ToolInputParameters to bridge the gap safely at compile time.
type AdkParams = ToolInputParameters;

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

// ─── Tool Definitions ───────────────────────────────────────────────────────

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
    {
        name: "get_plot_thread_status",
        description: "Track plotline engagement across scenes. Shows which plot threads are advancing, newly mentioned, or dormant in each scene.",
        category: "core",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
        }),
    },
    {
        name: "get_scene_focus",
        description: "Get complete context for coaching on a single scene: metadata, status, word count, adjacent scenes, linked characters/locations/plotlines, and open annotations.",
        category: "core",
        parameters: z.object({
            sceneId: z.string().describe("The scene node ID"),
        }),
    },
    {
        name: "get_manuscript_context",
        description: "Get the full manuscript context for analysis: outline with scene previews, character profiles, plotline summaries, and relationships.",
        category: "core",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
        }),
    },
    {
        name: "get_consistency_context",
        description: "Gather character profiles and scene text for consistency analysis. Optionally focus on a single scene.",
        category: "core",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
            sceneId: z.string().optional().describe("Focus on a specific scene"),
        }),
    },
    {
        name: "get_voice_context",
        description: "Gather character profiles and scene dialogue for voice consistency analysis.",
        category: "core",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
            sceneId: z.string().describe("The scene to analyze"),
        }),
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
        description: "Update a structure node's title, synopsis, status, order, or parent. Requires contentHash from get_outline to prevent stale overwrites.",
        category: "structure",
        parameters: z.object({
            nodeId: z.string().describe("The node ID to update"),
            contentHash: ContentHash.node,
            title: z.string().optional().describe("New title"),
            synopsis: z.string().optional().describe("New synopsis"),
            status: z.enum(["OUTLINE", "DRAFT", "REVISED", "FINAL"]).optional().describe("New status"),
            orderIndex: NodeOrderIndex.optional().describe("New order index"),
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
        description: "Write new content to a scene. Provide either 'content' (HTML string) or 'blocks' (structured content/beat array). Requires contentHash from read_scene_content to prevent stale overwrites.",
        category: "structure",
        parameters: z.object({
            nodeId: z.string().describe("The scene node ID"),
            contentHash: ContentHash.scene,
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
        description: "Update a story object's fields. Requires contentHash from get_story_object to prevent stale overwrites.",
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
        description: "Update a universe's metadata. Requires contentHash from get_universe to prevent stale overwrites.",
        category: "world_building",
        parameters: z.object({
            universeId: z.string().describe("The universe ID"),
            contentHash: ContentHash.universe,
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
        description: "Update a world object's fields. Requires contentHash from get_world_object to prevent stale overwrites.",
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
        description: "Add a state-history entry to a world object's timeline. Timeline entries track how an object changes over story time (e.g. 'Year 12 — apprenticed to the blacksmith'). Use this to record key life events, status changes, or turning points for story consistency.",
        category: "world_building",
        parameters: z.object({
            worldObjectId: z.string().describe("The world object ID"),
            label: z.string().describe("Period or event label (e.g. 'Year 12', 'Post-War', 'Age 20')"),
            description: z.string().optional().describe("What is true about this object at this point in story time"),
            attributes: z.string().optional().describe("JSON blob for structured data"),
            projectId: z.string().optional().describe("Optional project ID this entry relates to"),
            orderIndex: z.number().optional().describe("Order index"),
        }),
    },
    {
        name: "update_timeline_entry",
        description: "Update a world object's timeline entry. Timeline entries are state-history records tracking how an object changes over story time. Requires contentHash from get_world_object (the entry's contentHash in the timeline array) to prevent stale overwrites.",
        category: "world_building",
        parameters: z.object({
            entryId: z.string().describe("The entry ID"),
            contentHash: ContentHash.timelineEntry,
            label: z.string().optional().describe("New period or event label"),
            description: z.string().optional().describe("Updated description of what is true at this point"),
            attributes: z.string().optional().describe("New JSON blob"),
            orderIndex: z.number().optional().describe("New order index"),
        }),
    },
    {
        name: "delete_timeline_entry",
        description: "Delete a state-history entry from a world object's timeline",
        category: "world_building",
        parameters: z.object({
            entryId: z.string().describe("The entry ID"),
        }),
    },
    {
        name: "reorder_timeline_entries",
        description: "Reorder state-history entries on a world object's timeline",
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
        name: "export_hashnode",
        description: "Export a node or project in Hashnode-ready Markdown format",
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
        description: "Update a project's metadata. Requires contentHash from get_project to prevent stale overwrites.",
        category: "admin",
        parameters: z.object({
            projectId: z.string().describe("The project ID"),
            contentHash: ContentHash.project,
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

/** Get all registered tool definitions */
export function getAllTools(): ToolDefinition[] {
    return tools;
}

// ─── Import all tool handler implementations ─────────────────────────────────

import { getProject, createProject, updateProject } from "@/mcp/tools/projects";
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
} from "@/mcp/tools/structure";
import {
  listStoryObjects,
  getStoryObject,
  createStoryObject,
  updateStoryObject,
  deleteStoryObject,
} from "@/mcp/tools/story-objects";
import {
  listRelationships,
  createRelationship,
  deleteRelationship,
} from "@/mcp/tools/relationships";
import {
  exportManuscript,
  exportStoryBible,
  exportHashnode,
  getProjectSummary,
} from "@/mcp/tools/export";
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
} from "@/mcp/tools/universes";
import { listSkills } from "@/mcp/skills";
import {
  getPlotThreadStatus,
  getSceneFocus,
  getManuscriptContext,
  getConsistencyContext,
  getVoiceContext,
} from "@/mcp/tools/coaching";
import { GoogleDocsExporter } from "@/lib/export/google-docs-exporter";
import { prisma } from "@/lib/db";
import { env, DESTRUCTIVE_TOOL_DISABLED_MESSAGE } from "@/lib/env";
import {
  assertUniverseOwner,
  projectIdForNode,
  projectIdForStoryObject,
  projectIdForAnnotation,
  universeIdForWorldObject,
  universeIdForTimelineEntry,
  relationshipOwner,
} from "@/lib/ownership";

// ─── Chat tool scoping (SEC-01) ───────────────────────────────────────────────

/** Identity and scope for one chat turn. Every tool is pinned to `projectId`. */
export interface ToolContext {
  userId: string | null;
  userEmail: string | null;
  projectId: string;
  role: "OWNER" | "EDITOR" | null;
}

/** Tools that must never be reachable from the web chat (credentials, DB snapshot/restore). */
const CHAT_EXCLUDED_TOOLS: ReadonlySet<string> = new Set([
  "snapshot_database", "list_snapshots", "restore_snapshot",
  "google_auth_status", "google_auth_connect", "google_auth_callback", "google_auth_disconnect",
]);

export function isChatExcludedTool(name: string): boolean {
  return CHAT_EXCLUDED_TOOLS.has(name);
}

/** Destructive tools — every chat `delete_*` tool, blocked unless MCP_ALLOW_DESTRUCTIVE=true, the same gate as MCP (WCA-032). */
export function isChatDestructiveTool(name: string): boolean {
  return name.startsWith("delete_");
}

function guardDestructive(executor: (args: Args) => Promise<unknown>): (args: Args) => Promise<unknown> {
  return async (args) => {
    if (!env.MCP_ALLOW_DESTRUCTIVE) {
      throw new Error(DESTRUCTIVE_TOOL_DISABLED_MESSAGE);
    }
    return executor(args);
  };
}

// ─── Handler dispatch map ────────────────────────────────────────────────────
// Maps tool name → execute function for ADK's execute signature

type Args = Record<string, unknown>;

/**
 * Builds the tool executors for one chat turn, pinned to `ctx.projectId`.
 * A `projectId` argument that differs from the pin is rejected; node/object/
 * annotation/relationship IDs are resolved to their owning project and compared.
 * Universe tools are allowed only for the project's own linked universe or a
 * universe `ctx.userId` owns directly.
 */
function buildToolExecutors(ctx: ToolContext): Record<string, (args: Args) => Promise<unknown>> {
  const forbidden = (what: string) => new Error(`Forbidden: ${what} is outside the current project`);

  const requireProject = (projectId: unknown): void => {
    if (projectId !== ctx.projectId) throw forbidden("project");
  };
  const requireNode = async (nodeId: string) => requireProject(await projectIdForNode(nodeId));
  const requireStoryObject = async (objectId: string) => requireProject(await projectIdForStoryObject(objectId));
  const requireAnnotation = async (id: string) => requireProject(await projectIdForAnnotation(id));
  const requireUniverse = async (universeId: string) => {
    const project = await prisma.project.findUnique({ where: { id: ctx.projectId }, select: { universeId: true } });
    if (project?.universeId === universeId) return; // the project's own linked universe
    await assertUniverseOwner(universeId, ctx.userId); // or one the caller owns (no-op when userId is null)
  };
  const requireWorldObject = async (objectId: string) => requireUniverse(await universeIdForWorldObject(objectId));
  const requireTimelineEntry = async (entryId: string) => requireUniverse(await universeIdForTimelineEntry(entryId));
  const requireRelationship = async (relationshipId: string) => {
    const owner = await relationshipOwner(relationshipId);
    if (owner.projectId) return requireProject(owner.projectId);
    if (owner.universeId) return requireUniverse(owner.universeId);
    throw forbidden("relationship");
  };
  const requireOwnerRole = () => {
    if (ctx.userId && ctx.role !== "OWNER") throw new Error("Forbidden: only the project owner may do this");
  };
  const pid = ctx.projectId;

  return {
    // Core — chat is scoped to one project, so listing returns only that project.
    list_projects: async () => ({ projects: [await getProject(null, pid)], total: 1 }),
    get_project: async (a) => { requireProject(a.projectId); return getProject(null, pid); },
    get_outline: async (a) => { requireProject(a.projectId); return getOutline(pid); },
    read_scene_content: async (a) => { await requireNode(a.nodeId as string); return readSceneContent(a.nodeId as string); },
    list_story_objects: async (a) => { requireProject(a.projectId); return listStoryObjects(a as Parameters<typeof listStoryObjects>[0]); },
    get_project_summary: async () => getProjectSummary(pid),
    get_open_annotations: async () => getOpenAnnotations(pid), // never cross-project from chat
    list_skills: async () => listSkills(),
    get_plot_thread_status: async (a) => { requireProject(a.projectId); return getPlotThreadStatus(pid); },
    get_scene_focus: async (a) => { await requireNode(a.sceneId as string); return getSceneFocus(a.sceneId as string); },
    get_manuscript_context: async (a) => { requireProject(a.projectId); return getManuscriptContext(pid); },
    get_consistency_context: async (a) => {
      requireProject(a.projectId);
      if (a.sceneId) await requireNode(a.sceneId as string);
      return getConsistencyContext(pid, a.sceneId as string | undefined);
    },
    get_voice_context: async (a) => { requireProject(a.projectId); await requireNode(a.sceneId as string); return getVoiceContext(pid, a.sceneId as string); },

    // Structure
    create_node: async (a) => {
      requireProject(a.projectId);
      if (a.parentId) await requireNode(a.parentId as string);
      return createNode(a as Parameters<typeof createNode>[0]);
    },
    update_node: async (a) => {
      const { nodeId, contentHash, ...data } = a;
      await requireNode(nodeId as string);
      if (data.parentId) await requireNode(data.parentId as string);
      return updateNode(nodeId as string, data as Parameters<typeof updateNode>[1], contentHash as string);
    },
    delete_node: async (a) => { await requireNode(a.nodeId as string); return deleteNode(a.nodeId as string); },
    write_scene_content: async (a) => {
      await requireNode(a.nodeId as string);
      if (a.blocks) {
        return writeSceneContentFromBlocks(
          a.nodeId as string,
          a.blocks as { type: "CONTENT" | "BEAT"; content: string }[],
          a.contentHash as string,
        );
      }
      return writeSceneContent(a.nodeId as string, a.content as string, a.contentHash as string);
    },
    get_scene_versions: async (a) => { await requireNode(a.nodeId as string); return getSceneVersions(a.nodeId as string, a.limit as number); },
    restore_scene_version: async (a) => { await requireNode(a.nodeId as string); return restoreSceneVersion(a.nodeId as string, a.versionId as string); },
    add_annotation: async (a) => {
      await requireNode(a.nodeId as string);
      return addAnnotation(a.nodeId as string, a.content as string, a.range as string, a.selectedText as string | null);
    },
    update_annotation: async (a) => {
      const { annotationId, ...data } = a;
      await requireAnnotation(annotationId as string);
      return updateAnnotation(annotationId as string, data as Parameters<typeof updateAnnotation>[1]);
    },
    delete_annotation: async (a) => { await requireAnnotation(a.annotationId as string); return deleteAnnotation(a.annotationId as string); },
    resolve_annotation: async (a) => { await requireAnnotation(a.annotationId as string); return resolveAnnotation(a.annotationId as string, a.resolved as boolean); },

    // Characters / Story Objects
    get_story_object: async (a) => { await requireStoryObject(a.objectId as string); return getStoryObject(a.objectId as string); },
    create_story_object: async (a) => { requireProject(a.projectId); return createStoryObject(a as Parameters<typeof createStoryObject>[0]); },
    update_story_object: async (a) => {
      const { objectId, contentHash, ...data } = a;
      await requireStoryObject(objectId as string);
      return updateStoryObject(objectId as string, data as Parameters<typeof updateStoryObject>[1], contentHash as string);
    },
    delete_story_object: async (a) => { await requireStoryObject(a.objectId as string); return deleteStoryObject(a.objectId as string); },
    list_relationships: async (a) => { requireProject(a.projectId); return listRelationships(pid); },
    create_relationship: async (a) => {
      requireProject(a.projectId);
      for (const k of ["fromNodeId", "toNodeId"] as const) if (a[k]) await requireNode(a[k] as string);
      for (const k of ["fromObjectId", "toObjectId"] as const) if (a[k]) await requireStoryObject(a[k] as string);
      return createRelationship(a as Parameters<typeof createRelationship>[0]);
    },
    delete_relationship: async (a) => { await requireRelationship(a.relationshipId as string); return deleteRelationship(a.relationshipId as string); },

    // World Building
    list_universes: async () => listUniverses(ctx.userId),
    get_universe: async (a) => { await requireUniverse(a.universeId as string); return getUniverse(a.universeId as string); },
    create_universe: async (a) => createUniverse(a as Parameters<typeof createUniverse>[0], ctx.userId),
    update_universe: async (a) => {
      const { universeId, contentHash, ...data } = a;
      await requireUniverse(universeId as string);
      return updateUniverse(universeId as string, data as Parameters<typeof updateUniverse>[1], contentHash as string);
    },
    delete_universe: async (a) => { await requireUniverse(a.universeId as string); return deleteUniverse(a.universeId as string); },
    list_world_objects: async (a) => { await requireUniverse(a.universeId as string); return listWorldObjects(a.universeId as string, a.type as string | undefined); },
    get_world_object: async (a) => { await requireWorldObject(a.objectId as string); return getWorldObject(a.objectId as string); },
    create_world_object: async (a) => { await requireUniverse(a.universeId as string); return createWorldObject(a as Parameters<typeof createWorldObject>[0]); },
    update_world_object: async (a) => {
      const { objectId, contentHash, ...data } = a;
      await requireWorldObject(objectId as string);
      return updateWorldObject(objectId as string, data as Parameters<typeof updateWorldObject>[1], contentHash as string);
    },
    delete_world_object: async (a) => { await requireWorldObject(a.objectId as string); return deleteWorldObject(a.objectId as string); },
    add_timeline_entry: async (a) => {
      await requireWorldObject(a.worldObjectId as string);
      if (a.projectId) requireProject(a.projectId);
      return addTimelineEntry(a as Parameters<typeof addTimelineEntry>[0]);
    },
    update_timeline_entry: async (a) => {
      const { entryId, contentHash, ...data } = a;
      await requireTimelineEntry(entryId as string);
      return updateTimelineEntry(entryId as string, data as Parameters<typeof updateTimelineEntry>[1], contentHash as string);
    },
    delete_timeline_entry: async (a) => { await requireTimelineEntry(a.entryId as string); return deleteTimelineEntry(a.entryId as string); },
    reorder_timeline_entries: async (a) => {
      await requireWorldObject(a.worldObjectId as string);
      return reorderTimelineEntries(a.worldObjectId as string, a.orderedIds as string[]);
    },
    transfer_story_object_to_universe: async (a) => {
      await requireStoryObject(a.storyObjectId as string);
      await requireUniverse(a.universeId as string);
      return transferStoryObjectToUniverse(a.storyObjectId as string, a.universeId as string);
    },
    link_project_to_universe: async (a) => {
      requireProject(a.projectId);
      await assertUniverseOwner(a.universeId as string, ctx.userId);
      return linkProjectToUniverse(pid, a.universeId as string);
    },
    unlink_project_from_universe: async (a) => { requireProject(a.projectId); return unlinkProjectFromUniverse(pid); },

    // Export
    export_manuscript: async (a) => { requireProject(a.projectId); return exportManuscript(pid); },
    export_story_bible: async (a) => { requireProject(a.projectId); return exportStoryBible(pid); },
    export_hashnode: async (a) => {
      requireProject(a.projectId);
      if (a.nodeId) await requireNode(a.nodeId as string);
      return exportHashnode(pid, a.nodeId as string | undefined);
    },
    export_to_google_docs: async (a) => {
      const { projectId, universeId, exportMode } = a as { projectId?: string; universeId?: string; exportMode: "UNIVERSE" | "STORY_INTERNAL" | "STORY_READER" };
      requireOwnerRole();
      if (exportMode === "UNIVERSE") {
        if (!universeId) throw new Error("universeId is required for UNIVERSE mode");
        await requireUniverse(universeId);
        return GoogleDocsExporter.exportToGoogleDocs(universeId, exportMode, ctx.userId);
      }
      requireProject(projectId);
      return GoogleDocsExporter.exportToGoogleDocs(pid, exportMode, ctx.userId);
    },

    // Admin (project-level only; credential + snapshot tools are excluded from chat)
    create_project: async (a) => createProject({ ...(a as Parameters<typeof createProject>[0]), userId: ctx.userId }),
    update_project: async (a) => {
      const { projectId, contentHash, ...data } = a;
      requireProject(projectId);
      return updateProject(null, pid, data as Parameters<typeof updateProject>[2], contentHash as string | undefined);
    },
  };
}

// ─── Build ADK FunctionTool instances ────────────────────────────────────────

/** Convert a ToolDefinition + executor into an ADK FunctionTool */
function toAdkTool(def: ToolDefinition, executor: (args: Args) => Promise<unknown>): FunctionTool {
  return new FunctionTool({
    name: def.name,
    description: def.description,
    // Cast: project zod v3 ↔ ADK's bundled zod v3 are structurally identical
    parameters: def.parameters as unknown as AdkParams,
    execute: async (input) => {
      const tracer = getTracer();
      return tracer.startActiveSpan(`tool.${def.name}`, async (span) => {
        try {
          span.setAttribute("tool.name", def.name);
          span.setAttribute("tool.category", def.category);
          // Lengths only: tool args/results carry manuscript text, which must not leave the app in traces (SEC-09)
          span.setAttribute("tool.input_length", JSON.stringify(input).length);

          const result = await executor(input as Record<string, unknown>);

          span.setAttribute("tool.output_length", JSON.stringify(result).length);
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
    },
  });
}

/** Builds the ADK FunctionTool instances for one chat turn, indexed by name and by category. */
function buildAdkToolMaps(ctx: ToolContext): {
  byName: Map<string, FunctionTool>;
  byCategory: Map<ToolCategory, FunctionTool[]>;
} {
  const executors = buildToolExecutors(ctx);
  const byName = new Map<string, FunctionTool>();
  const byCategory = new Map<ToolCategory, FunctionTool[]>();
  for (const def of getAllTools()) {
    if (CHAT_EXCLUDED_TOOLS.has(def.name)) continue;
    const executor = executors[def.name];
    if (!executor) throw new Error(`No executor found for tool: ${def.name}`);
    const tool = toAdkTool(def, isChatDestructiveTool(def.name) ? guardDestructive(executor) : executor);
    byName.set(def.name, tool);
    const list = byCategory.get(def.category) ?? [];
    list.push(tool);
    byCategory.set(def.category, list);
  }
  return { byName, byCategory };
}

// ─── load_toolset as an ADK FunctionTool ─────────────────────────────────────

/**
 * The load_toolset meta-tool. When used with DynamicToolset, it signals
 * the toolset to expand the available tool set for subsequent LLM turns.
 *
 * The execute function returns a confirmation with the list of newly loaded
 * tool names. The actual tool injection is handled by DynamicToolset.
 */
export const loadToolsetTool = new FunctionTool({
  name: "load_toolset",
  description:
    "Load additional tool categories into the current session. " +
    "Available categories: structure, characters, world_building, export, admin, skills. " +
    "Core tools are always loaded.",
  parameters: z.object({
    category: z
      .enum(["structure", "characters", "world_building", "export", "admin", "skills"])
      .describe("The tool category to load"),
  }) as unknown as AdkParams,
  execute: async (input) => {
    const { category } = input as { category: string };
    const cat = category as ToolCategory;
    const names = getAllTools().filter((t) => t.category === cat && !CHAT_EXCLUDED_TOOLS.has(t.name)).map((t) => t.name);
    return {
      loaded: cat,
      toolCount: names.length,
      tools: names,
    };
  },
});

// ─── Public API ──────────────────────────────────────────────────────────────
// Every function below is context-bound: tools are built fresh per chat turn,
// pinned to ctx.projectId, rather than cached at module load (SEC-01).

/** Get all ADK FunctionTool instances for one chat turn */
export function getAllAdkTools(ctx: ToolContext): FunctionTool[] {
  return Array.from(buildAdkToolMaps(ctx).byName.values());
}

/** Get ADK FunctionTool instances for the given categories */
export function getAdkTools(ctx: ToolContext, categories: ToolCategory[]): FunctionTool[] {
  const { byCategory } = buildAdkToolMaps(ctx);
  return categories.flatMap((c) => byCategory.get(c) ?? []);
}

/** Get the core tools + load_toolset meta-tool as ADK FunctionTool instances */
export function getCoreAdkTools(ctx: ToolContext): FunctionTool[] {
  return [...getAdkTools(ctx, ["core"]), loadToolsetTool];
}

/** Look up an ADK FunctionTool by name */
export function getAdkToolByName(ctx: ToolContext, name: string): FunctionTool | undefined {
  return buildAdkToolMaps(ctx).byName.get(name);
}

/** Get the list of tool categories */
export function getAdkCategories(): ToolCategory[] {
  return Array.from(new Set(getAllTools().map((t) => t.category)));
}

// ─── DynamicToolset: ADK BaseToolset for load_toolset pattern ────────────────

/**
 * A toolset that starts with core tools + load_toolset, and expands when the
 * LLM calls load_toolset. Use this as a tool source for an ADK LlmAgent.
 *
 * Every tool built for this toolset is pinned to `ctx.projectId` (SEC-01) —
 * construct a fresh instance per chat turn, never cache across requests.
 *
 * Usage:
 *   const toolset = new DynamicToolset(ctx);
 *   const agent = new LlmAgent({ tools: [toolset], ... });
 *
 * When the agent calls load_toolset, the execute function updates
 * the toolset's loaded categories. On the next getTools() call,
 * the newly loaded category's tools are included.
 */
export class DynamicToolset extends BaseToolset {
  private loadedCategories: Set<ToolCategory> = new Set(["core"]);
  private readonly byCategory: Map<ToolCategory, FunctionTool[]>;

  constructor(ctx: ToolContext, filter?: ToolPredicate | string[]) {
    super(filter ?? (() => true));
    this.byCategory = buildAdkToolMaps(ctx).byCategory;
  }

  /** Load a category (called externally or by load_toolset's afterTool callback) */
  loadCategory(category: ToolCategory): void {
    this.loadedCategories.add(category);
  }

  /** Get the set of currently loaded categories */
  getLoadedCategories(): Set<ToolCategory> {
    return new Set(this.loadedCategories);
  }

  /** Reset to only core tools */
  reset(): void {
    this.loadedCategories = new Set(["core"]);
  }

  async getTools(_context?: ReadonlyContext): Promise<BaseTool[]> {
    const tools: BaseTool[] = [];

    // Add tools for all loaded categories
    for (const cat of this.loadedCategories) {
      const catTools = this.byCategory.get(cat);
      if (catTools) tools.push(...catTools);
    }

    // Always include load_toolset
    tools.push(loadToolsetTool);

    return tools;
  }

  async close(): Promise<void> {
    // No resources to clean up
  }
}
