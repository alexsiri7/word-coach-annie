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
        description: "Update a world object's timeline entry. Timeline entries are state-history records tracking how an object changes over story time.",
        category: "world_building",
        parameters: z.object({
            entryId: z.string().describe("The entry ID"),
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

/** Get all registered tool definitions */
export function getAllTools(): ToolDefinition[] {
    return tools;
}

// ─── Import all tool handler implementations ─────────────────────────────────

import { listProjects, getProject, createProject, updateProject } from "@/mcp/tools/projects";
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
  snapshotDatabase,
  listDatabaseSnapshots,
  restoreDatabaseSnapshot,
} from "@/mcp/tools/snapshots";
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
import { GoogleAuthController } from "@/lib/controllers/google-auth";
import { GoogleDocsExporter } from "@/lib/export/google-docs-exporter";

// ─── Handler dispatch map ────────────────────────────────────────────────────
// Maps tool name → execute function for ADK's execute signature

type Args = Record<string, unknown>;

const toolExecutors: Record<string, (args: Args) => Promise<unknown>> = {
  // Core
  list_projects: async (a) => listProjects(a.limit as number, a.offset as number),
  get_project: async (a) => getProject(a.projectId as string),
  get_outline: async (a) => getOutline(a.projectId as string),
  read_scene_content: async (a) => readSceneContent(a.nodeId as string),
  list_story_objects: async (a) => listStoryObjects(a as Parameters<typeof listStoryObjects>[0]),
  get_project_summary: async (a) => getProjectSummary(a.projectId as string),
  get_open_annotations: async (a) => getOpenAnnotations(a.projectId as string | undefined),
  list_skills: async () => listSkills(),
  get_plot_thread_status: async (a) => getPlotThreadStatus(a.projectId as string),
  get_scene_focus: async (a) => getSceneFocus(a.sceneId as string),
  get_manuscript_context: async (a) => getManuscriptContext(a.projectId as string),
  get_consistency_context: async (a) => getConsistencyContext(a.projectId as string, a.sceneId as string | undefined),
  get_voice_context: async (a) => getVoiceContext(a.projectId as string, a.sceneId as string),

  // Structure
  create_node: async (a) => createNode(a as Parameters<typeof createNode>[0]),
  update_node: async (a) => {
    const { nodeId, ...data } = a;
    return updateNode(nodeId as string, data as Parameters<typeof updateNode>[1]);
  },
  delete_node: async (a) => deleteNode(a.nodeId as string),
  write_scene_content: async (a) => {
    if (a.blocks) {
      return writeSceneContentFromBlocks(
        a.nodeId as string,
        a.blocks as { type: "CONTENT" | "BEAT"; content: string }[],
      );
    }
    return writeSceneContent(a.nodeId as string, a.content as string);
  },
  get_scene_versions: async (a) => getSceneVersions(a.nodeId as string, a.limit as number),
  restore_scene_version: async (a) => restoreSceneVersion(a.nodeId as string, a.versionId as string),
  add_annotation: async (a) =>
    addAnnotation(a.nodeId as string, a.content as string, a.range as string, a.selectedText as string | null),
  update_annotation: async (a) => {
    const { annotationId, ...data } = a;
    return updateAnnotation(annotationId as string, data as Parameters<typeof updateAnnotation>[1]);
  },
  delete_annotation: async (a) => deleteAnnotation(a.annotationId as string),
  resolve_annotation: async (a) => resolveAnnotation(a.annotationId as string, a.resolved as boolean),

  // Characters / Story Objects
  get_story_object: async (a) => getStoryObject(a.objectId as string),
  create_story_object: async (a) => createStoryObject(a as Parameters<typeof createStoryObject>[0]),
  update_story_object: async (a) => {
    const { objectId, ...data } = a;
    return updateStoryObject(objectId as string, data as Parameters<typeof updateStoryObject>[1]);
  },
  delete_story_object: async (a) => deleteStoryObject(a.objectId as string),
  list_relationships: async (a) => listRelationships(a.projectId as string),
  create_relationship: async (a) => createRelationship(a as Parameters<typeof createRelationship>[0]),
  delete_relationship: async (a) => deleteRelationship(a.relationshipId as string),

  // World Building
  list_universes: async () => listUniverses(),
  get_universe: async (a) => getUniverse(a.universeId as string),
  create_universe: async (a) => createUniverse(a as Parameters<typeof createUniverse>[0]),
  update_universe: async (a) => {
    const { universeId, ...data } = a;
    return updateUniverse(universeId as string, data as Parameters<typeof updateUniverse>[1]);
  },
  delete_universe: async (a) => deleteUniverse(a.universeId as string),
  list_world_objects: async (a) => listWorldObjects(a.universeId as string, a.type as string | undefined),
  get_world_object: async (a) => getWorldObject(a.objectId as string),
  create_world_object: async (a) => createWorldObject(a as Parameters<typeof createWorldObject>[0]),
  update_world_object: async (a) => {
    const { objectId, ...data } = a;
    return updateWorldObject(objectId as string, data as Parameters<typeof updateWorldObject>[1]);
  },
  delete_world_object: async (a) => deleteWorldObject(a.objectId as string),
  add_timeline_entry: async (a) => addTimelineEntry(a as Parameters<typeof addTimelineEntry>[0]),
  update_timeline_entry: async (a) => {
    const { entryId, ...data } = a;
    return updateTimelineEntry(entryId as string, data as Parameters<typeof updateTimelineEntry>[1]);
  },
  delete_timeline_entry: async (a) => deleteTimelineEntry(a.entryId as string),
  reorder_timeline_entries: async (a) =>
    reorderTimelineEntries(a.worldObjectId as string, a.orderedIds as string[]),
  transfer_story_object_to_universe: async (a) =>
    transferStoryObjectToUniverse(a.storyObjectId as string, a.universeId as string),
  link_project_to_universe: async (a) =>
    linkProjectToUniverse(a.projectId as string, a.universeId as string),
  unlink_project_from_universe: async (a) =>
    unlinkProjectFromUniverse(a.projectId as string),

  // Export
  export_manuscript: async (a) => exportManuscript(a.projectId as string),
  export_story_bible: async (a) => exportStoryBible(a.projectId as string),
  export_hashnode: async (a) => exportHashnode(a.projectId as string, a.nodeId as string | undefined),
  export_to_google_docs: async (a) => {
    const { projectId, universeId, exportMode } = a as {
      projectId?: string;
      universeId?: string;
      exportMode: "UNIVERSE" | "STORY_INTERNAL" | "STORY_READER";
    };
    if (!projectId && !universeId) {
      throw new Error("Either projectId or universeId must be provided");
    }
    const entityId = exportMode === "UNIVERSE" ? universeId! : projectId!;
    return GoogleDocsExporter.exportToGoogleDocs(entityId, exportMode);
  },

  // Admin
  create_project: async (a) => createProject(a as Parameters<typeof createProject>[0]),
  update_project: async (a) => {
    const { projectId, ...data } = a;
    return updateProject(projectId as string, data as Parameters<typeof updateProject>[1]);
  },
  snapshot_database: async (a) => snapshotDatabase(a.message as string),
  list_snapshots: async (a) => listDatabaseSnapshots(a.limit as number),
  restore_snapshot: async (a) => restoreDatabaseSnapshot(a.commitHash as string),
  google_auth_status: async () => GoogleAuthController.getStatus(),
  google_auth_connect: async () => ({ authUrl: GoogleAuthController.getAuthUrl() }),
  google_auth_callback: async (a) => {
    await GoogleAuthController.handleCallback(a.code as string);
    return { success: true };
  },
  google_auth_disconnect: async () => {
    await GoogleAuthController.disconnect();
    return { success: true };
  },
};

// ─── Build ADK FunctionTool instances ────────────────────────────────────────

/** Convert a ToolDefinition + executor into an ADK FunctionTool */
function toAdkTool(def: ToolDefinition): FunctionTool {
  const executor = toolExecutors[def.name];
  if (!executor) {
    throw new Error(`No executor found for tool: ${def.name}`);
  }

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
          const inputStr = JSON.stringify(input);
          // Cap at 4KB to avoid bloating traces
          span.setAttribute("tool.input", inputStr.slice(0, 4096));

          const result = await executor(input as Record<string, unknown>);

          const resultStr = JSON.stringify(result);
          span.setAttribute("tool.output", resultStr.slice(0, 4096));
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

/** All ADK FunctionTool instances, indexed by name */
const adkToolMap = new Map<string, FunctionTool>();

/** All ADK FunctionTool instances, indexed by category */
const adkToolsByCategory = new Map<ToolCategory, FunctionTool[]>();

// Build the maps on module load
for (const def of getAllTools()) {
  const tool = toAdkTool(def);
  adkToolMap.set(def.name, tool);

  let categoryTools = adkToolsByCategory.get(def.category);
  if (!categoryTools) {
    categoryTools = [];
    adkToolsByCategory.set(def.category, categoryTools);
  }
  categoryTools.push(tool);
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
    const tools = adkToolsByCategory.get(cat) ?? [];
    return {
      loaded: cat,
      toolCount: tools.length,
      tools: tools.map((t) => t.name),
    };
  },
});

// ─── Public API ──────────────────────────────────────────────────────────────

/** Get all ADK FunctionTool instances */
export function getAllAdkTools(): FunctionTool[] {
  return Array.from(adkToolMap.values());
}

/** Get ADK FunctionTool instances for the given categories */
export function getAdkTools(categories: ToolCategory[]): FunctionTool[] {
  const result: FunctionTool[] = [];
  for (const cat of categories) {
    const tools = adkToolsByCategory.get(cat);
    if (tools) result.push(...tools);
  }
  return result;
}

/** Get the core tools + load_toolset meta-tool as ADK FunctionTool instances */
export function getCoreAdkTools(): FunctionTool[] {
  return [...getAdkTools(["core"]), loadToolsetTool];
}

/** Look up an ADK FunctionTool by name */
export function getAdkToolByName(name: string): FunctionTool | undefined {
  return adkToolMap.get(name);
}

/** Get the list of tool categories */
export function getAdkCategories(): ToolCategory[] {
  return Array.from(adkToolsByCategory.keys());
}

// ─── DynamicToolset: ADK BaseToolset for load_toolset pattern ────────────────

/**
 * A toolset that starts with core tools + load_toolset, and expands when the
 * LLM calls load_toolset. Use this as a tool source for an ADK LlmAgent.
 *
 * Usage:
 *   const toolset = new DynamicToolset();
 *   const agent = new LlmAgent({ tools: [toolset], ... });
 *
 * When the agent calls load_toolset, the execute function updates
 * the toolset's loaded categories. On the next getTools() call,
 * the newly loaded category's tools are included.
 */
export class DynamicToolset extends BaseToolset {
  private loadedCategories: Set<ToolCategory> = new Set(["core"]);

  constructor(filter?: ToolPredicate | string[]) {
    super(filter ?? (() => true));
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
      const catTools = adkToolsByCategory.get(cat);
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
