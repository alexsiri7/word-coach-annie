/**
 * In-app chat tools: the per-turn executors (pinned to one project, SEC-01), their
 * wrapping as Google ADK FunctionTools, and the two-tier category loading
 * (load_toolset + DynamicToolset). Tool names, descriptions and schemas live in
 * src/lib/ai/tool-catalog/, shared with the MCP server.
 */
import { FunctionTool, BaseToolset } from "@google/adk";
import type { BaseTool, ToolPredicate, ToolInputParameters } from "@google/adk";
import type { ReadonlyContext } from "@google/adk";
import { z } from "zod";
import { SpanStatusCode } from "@opentelemetry/api";
import { getTracer } from "@/lib/telemetry";
import { CHAT_TOOL_SPECS, type ChatToolSpec, type ToolCategory } from "@/lib/ai/tool-catalog";

export type { ToolCategory } from "@/lib/ai/tool-catalog";

// ADK bundles its own zod v3 copy. The project's zod is structurally identical
// but TypeScript treats them as separate types due to private fields. We cast
// through ToolInputParameters to bridge the gap safely at compile time.
type AdkParams = ToolInputParameters;

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
import { env, DESTRUCTIVE_TOOL_DISABLED_MESSAGE } from "@/lib/env";
import { assertCanAccess, assertOwnerRole, type ChatRole, type Principal, type ResourceRef } from "@/lib/access/resource-access";
import { UserFacingError } from "@/lib/controllers/errors";

// ─── Chat tool scoping (SEC-01) ───────────────────────────────────────────────

/** Identity and scope for one chat turn. Every tool is pinned to `projectId`. */
export interface ToolContext {
  userId: string | null;
  userEmail: string | null;
  projectId: string;
  role: ChatRole;
}

/** Blocks a destructive spec's executor unless MCP_ALLOW_DESTRUCTIVE=true, the same gate as MCP (WCA-032). */
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

/** A chat tool: the resources it touches, checked before `run` (see `src/lib/access/resource-access.ts`). */
interface ChatTool {
  access?: (a: Args) => ResourceRef[];
  /** Refused to an EDITOR — only the project owner may run it. */
  ownerOnly?: true;
  run: (a: Args) => Promise<unknown>;
}

const project = (id: unknown): ResourceRef => ({ kind: "project", id: id as string });
const node = (id: unknown): ResourceRef => ({ kind: "node", id: id as string });
const storyObject = (id: unknown): ResourceRef => ({ kind: "storyObject", id: id as string });
const annotation = (id: unknown): ResourceRef => ({ kind: "annotation", id: id as string });
const universe = (id: unknown): ResourceRef => ({ kind: "universe", id: id as string });
const worldObject = (id: unknown): ResourceRef => ({ kind: "worldObject", id: id as string });
const timelineEntry = (id: unknown): ResourceRef => ({ kind: "timelineEntry", id: id as string });
const optional = (id: unknown, ref: (id: unknown) => ResourceRef): ResourceRef[] => (id ? [ref(id)] : []);

/**
 * Builds the chat tools for one turn, pinned to `ctx.projectId`. Each tool
 * declares the resources it touches; the chat principal accepts only those in
 * the pinned project, its linked universe, or a universe `ctx.userId` owns.
 */
function buildChatTools(ctx: ToolContext): Record<string, ChatTool> {
  const pid = ctx.projectId;

  return {
    // Core — chat is scoped to one project, so listing returns only that project.
    list_projects: { run: async () => ({ projects: [await getProject(null, pid)], total: 1 }) },
    get_project: { access: (a) => [project(a.projectId)], run: async () => getProject(null, pid) },
    get_outline: { access: (a) => [project(a.projectId)], run: async () => getOutline(pid) },
    read_scene_content: { access: (a) => [node(a.nodeId)], run: async (a) => readSceneContent(a.nodeId as string) },
    list_story_objects: { access: (a) => [project(a.projectId)], run: async (a) => listStoryObjects(a as Parameters<typeof listStoryObjects>[0]) },
    get_project_summary: { run: async () => getProjectSummary(pid) },
    get_open_annotations: { run: async () => getOpenAnnotations(pid) }, // never cross-project from chat
    list_skills: { run: async () => listSkills() },
    get_plot_thread_status: { access: (a) => [project(a.projectId)], run: async () => getPlotThreadStatus(pid) },
    get_scene_focus: { access: (a) => [node(a.sceneId)], run: async (a) => getSceneFocus(a.sceneId as string) },
    get_manuscript_context: { access: (a) => [project(a.projectId)], run: async () => getManuscriptContext(pid) },
    get_consistency_context: {
      access: (a) => [project(a.projectId), ...optional(a.sceneId, node)],
      run: async (a) => getConsistencyContext(pid, a.sceneId as string | undefined),
    },
    get_voice_context: {
      access: (a) => [project(a.projectId), node(a.sceneId)],
      run: async (a) => getVoiceContext(pid, a.sceneId as string),
    },

    // Structure
    create_node: {
      access: (a) => [project(a.projectId), ...optional(a.parentId, node)],
      run: async (a) => createNode(a as Parameters<typeof createNode>[0]),
    },
    update_node: {
      access: (a) => [node(a.nodeId), ...optional(a.parentId, node)],
      run: async (a) => {
        const { nodeId, contentHash, ...data } = a;
        return updateNode(nodeId as string, data as Parameters<typeof updateNode>[1], contentHash as string);
      },
    },
    delete_node: { access: (a) => [node(a.nodeId)], run: async (a) => deleteNode(a.nodeId as string) },
    write_scene_content: {
      access: (a) => [node(a.nodeId)],
      run: async (a) => {
        if (a.blocks) {
          return writeSceneContentFromBlocks(
            a.nodeId as string,
            a.blocks as { type: "CONTENT" | "BEAT"; content: string }[],
            a.contentHash as string,
          );
        }
        if (a.content === undefined) throw new UserFacingError("Either 'content' or 'blocks' must be provided");
        return writeSceneContent(a.nodeId as string, a.content as string, a.contentHash as string);
      },
    },
    get_scene_versions: { access: (a) => [node(a.nodeId)], run: async (a) => getSceneVersions(a.nodeId as string, a.limit as number) },
    restore_scene_version: { access: (a) => [node(a.nodeId)], run: async (a) => restoreSceneVersion(a.nodeId as string, a.versionId as string) },
    add_annotation: {
      access: (a) => [node(a.nodeId)],
      run: async (a) => addAnnotation(a.nodeId as string, a.content as string, a.range as string, a.selectedText as string | null),
    },
    update_annotation: {
      access: (a) => [annotation(a.annotationId)],
      run: async (a) => {
        const { annotationId, ...data } = a;
        return updateAnnotation(annotationId as string, data as Parameters<typeof updateAnnotation>[1]);
      },
    },
    delete_annotation: { access: (a) => [annotation(a.annotationId)], run: async (a) => deleteAnnotation(a.annotationId as string) },
    resolve_annotation: { access: (a) => [annotation(a.annotationId)], run: async (a) => resolveAnnotation(a.annotationId as string, a.resolved as boolean) },

    // Characters / Story Objects
    get_story_object: { access: (a) => [storyObject(a.objectId)], run: async (a) => getStoryObject(a.objectId as string) },
    create_story_object: { access: (a) => [project(a.projectId)], run: async (a) => createStoryObject(a as Parameters<typeof createStoryObject>[0]) },
    update_story_object: {
      access: (a) => [storyObject(a.objectId)],
      run: async (a) => {
        const { objectId, contentHash, ...data } = a;
        return updateStoryObject(objectId as string, data as Parameters<typeof updateStoryObject>[1], contentHash as string);
      },
    },
    delete_story_object: { access: (a) => [storyObject(a.objectId)], run: async (a) => deleteStoryObject(a.objectId as string) },
    list_relationships: { access: (a) => [project(a.projectId)], run: async () => listRelationships(pid) },
    create_relationship: {
      access: (a) => [
        project(a.projectId),
        ...optional(a.fromNodeId, node), ...optional(a.toNodeId, node),
        ...optional(a.fromObjectId, storyObject), ...optional(a.toObjectId, storyObject),
      ],
      run: async (a) => createRelationship(a as Parameters<typeof createRelationship>[0]),
    },
    delete_relationship: {
      access: (a) => [{ kind: "relationship", id: a.relationshipId as string }],
      run: async (a) => deleteRelationship(a.relationshipId as string),
    },

    // World Building
    list_universes: { run: async () => listUniverses(ctx.userId) },
    get_universe: { access: (a) => [universe(a.universeId)], run: async (a) => getUniverse(a.universeId as string) },
    create_universe: { run: async (a) => createUniverse(a as Parameters<typeof createUniverse>[0], ctx.userId) },
    update_universe: {
      access: (a) => [universe(a.universeId)],
      run: async (a) => {
        const { universeId, contentHash, ...data } = a;
        return updateUniverse(universeId as string, data as Parameters<typeof updateUniverse>[1], contentHash as string);
      },
    },
    delete_universe: { access: (a) => [universe(a.universeId)], run: async (a) => deleteUniverse(a.universeId as string) },
    list_world_objects: {
      access: (a) => [universe(a.universeId)],
      run: async (a) => listWorldObjects(a.universeId as string, a.type as string | undefined),
    },
    get_world_object: { access: (a) => [worldObject(a.objectId)], run: async (a) => getWorldObject(a.objectId as string) },
    create_world_object: {
      access: (a) => [universe(a.universeId)],
      run: async (a) => createWorldObject(a as Parameters<typeof createWorldObject>[0]),
    },
    update_world_object: {
      access: (a) => [worldObject(a.objectId)],
      run: async (a) => {
        const { objectId, contentHash, ...data } = a;
        return updateWorldObject(objectId as string, data as Parameters<typeof updateWorldObject>[1], contentHash as string);
      },
    },
    delete_world_object: { access: (a) => [worldObject(a.objectId)], run: async (a) => deleteWorldObject(a.objectId as string) },
    add_timeline_entry: {
      access: (a) => [worldObject(a.worldObjectId), ...optional(a.projectId, project)],
      run: async (a) => addTimelineEntry(a as Parameters<typeof addTimelineEntry>[0]),
    },
    update_timeline_entry: {
      access: (a) => [timelineEntry(a.entryId)],
      run: async (a) => {
        const { entryId, contentHash, ...data } = a;
        return updateTimelineEntry(entryId as string, data as Parameters<typeof updateTimelineEntry>[1], contentHash as string);
      },
    },
    delete_timeline_entry: { access: (a) => [timelineEntry(a.entryId)], run: async (a) => deleteTimelineEntry(a.entryId as string) },
    reorder_timeline_entries: {
      access: (a) => [worldObject(a.worldObjectId)],
      run: async (a) => reorderTimelineEntries(a.worldObjectId as string, a.orderedIds as string[]),
    },
    transfer_story_object_to_universe: {
      access: (a) => [storyObject(a.storyObjectId), universe(a.universeId)],
      run: async (a) => transferStoryObjectToUniverse(a.storyObjectId as string, a.universeId as string),
    },
    link_project_to_universe: {
      access: (a) => [project(a.projectId), { kind: "ownedUniverse", id: a.universeId as string }],
      run: async (a) => linkProjectToUniverse(pid, a.universeId as string),
    },
    unlink_project_from_universe: { access: (a) => [project(a.projectId)], run: async () => unlinkProjectFromUniverse(pid) },

    // Export
    export_manuscript: { access: (a) => [project(a.projectId)], run: async () => exportManuscript(pid) },
    export_story_bible: { access: (a) => [project(a.projectId)], run: async () => exportStoryBible(pid) },
    export_hashnode: {
      access: (a) => [project(a.projectId), ...optional(a.nodeId, node)],
      run: async (a) => exportHashnode(pid, a.nodeId as string | undefined),
    },
    export_to_google_docs: {
      ownerOnly: true,
      access: (a) => (a.exportMode === "UNIVERSE" ? optional(a.universeId, universe) : [project(a.projectId)]),
      run: async (a) => {
        const { universeId, exportMode } = a as { universeId?: string; exportMode: "UNIVERSE" | "STORY_INTERNAL" | "STORY_READER" };
        if (exportMode === "UNIVERSE") {
          if (!universeId) throw new Error("universeId is required for UNIVERSE mode");
          return GoogleDocsExporter.exportToGoogleDocs(universeId, exportMode, ctx.userId);
        }
        return GoogleDocsExporter.exportToGoogleDocs(pid, exportMode, ctx.userId);
      },
    },

    // Admin (project-level only; the Google credential tools have no chat category)
    create_project: { run: async (a) => createProject({ ...(a as Parameters<typeof createProject>[0]), userId: ctx.userId }) },
    update_project: {
      access: (a) => [project(a.projectId)],
      run: async (a) => {
        const { projectId: _projectId, contentHash, ...data } = a;
        return updateProject(null, pid, data as Parameters<typeof updateProject>[2], contentHash as string | undefined);
      },
    },
  };
}

// ─── Build ADK FunctionTool instances ────────────────────────────────────────

/** Convert a chat tool spec + executor into an ADK FunctionTool */
function toAdkTool(def: ChatToolSpec, executor: (args: Args) => Promise<unknown>): FunctionTool {
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
  const chatTools = buildChatTools(ctx);
  const principal: Principal = { userId: ctx.userId, pinnedProjectId: ctx.projectId, role: ctx.role };
  const byName = new Map<string, FunctionTool>();
  const byCategory = new Map<ToolCategory, FunctionTool[]>();
  for (const def of CHAT_TOOL_SPECS) {
    const chatTool = chatTools[def.name];
    if (!chatTool) throw new Error(`No executor found for tool: ${def.name}`);
    const executor = async (a: Args) => {
      if (chatTool.ownerOnly) assertOwnerRole(principal);
      await assertCanAccess(principal, chatTool.access?.(a) ?? []);
      return chatTool.run(a);
    };
    const tool = toAdkTool(def, def.destructive ? guardDestructive(executor) : executor);
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
    const names = CHAT_TOOL_SPECS.filter((t) => t.category === cat).map((t) => t.name);
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
  return Array.from(new Set(CHAT_TOOL_SPECS.map((t) => t.category)));
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
