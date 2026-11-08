import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getAllAdkTools,
  getAdkTools,
  getCoreAdkTools,
  getAdkToolByName,
  getAdkCategories,
  loadToolsetTool,
  DynamicToolset,
  getAllTools,
  isChatExcludedTool,
  isChatDestructiveTool,
  type ToolContext,
} from "@/lib/ai/adk-tools";

const spanAttributes = vi.hoisted(() => [] as Array<[string, unknown]>);

vi.mock("@/lib/telemetry", () => ({
  getTracer: () => ({
    startActiveSpan: (_name: string, fn: (span: unknown) => unknown) =>
      fn({
        setAttribute: (key: string, value: unknown) => spanAttributes.push([key, value]),
        setStatus: vi.fn(),
        end: vi.fn(),
      }),
  }),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    project: { findUnique: vi.fn(async () => null) },
  },
}));

vi.mock("@/lib/ownership", () => ({
  assertProjectOwner: vi.fn(async () => {}),
  assertUniverseOwner: vi.fn(async () => {}),
  projectIdForNode: vi.fn(async (nodeId: string) => (nodeId === "node-in-Q" ? "Q" : "P")),
  projectIdForStoryObject: vi.fn(async () => "P"),
  projectIdForAnnotation: vi.fn(async () => "P"),
  universeIdForWorldObject: vi.fn(async () => "U"),
  universeIdForTimelineEntry: vi.fn(async () => "U"),
  relationshipOwner: vi.fn(async () => ({ projectId: "P" })),
}));

vi.mock("@/mcp/tools/projects", () => ({
  listProjects: vi.fn(async () => []),
  getProject: vi.fn(async () => ({ id: "P", title: "Test" })),
  createProject: vi.fn(async () => ({ id: "P" })),
  updateProject: vi.fn(async () => ({ id: "P" })),
}));

vi.mock("@/mcp/tools/structure", () => ({
  getOutline: vi.fn(async () => ({})),
  createNode: vi.fn(async () => ({})),
  updateNode: vi.fn(async () => ({})),
  deleteNode: vi.fn(async () => ({})),
  readSceneContent: vi.fn(async () => ({})),
  writeSceneContent: vi.fn(async () => ({})),
  writeSceneContentFromBlocks: vi.fn(async () => ({})),
  getSceneVersions: vi.fn(async () => ({})),
  restoreSceneVersion: vi.fn(async () => ({})),
  addAnnotation: vi.fn(async () => ({})),
  updateAnnotation: vi.fn(async () => ({})),
  deleteAnnotation: vi.fn(async () => ({})),
  resolveAnnotation: vi.fn(async () => ({})),
  getOpenAnnotations: vi.fn(async () => ({})),
}));

vi.mock("@/mcp/tools/story-objects", () => ({
  listStoryObjects: vi.fn(async () => ({})),
  getStoryObject: vi.fn(async () => ({})),
  createStoryObject: vi.fn(async () => ({})),
  updateStoryObject: vi.fn(async () => ({})),
  deleteStoryObject: vi.fn(async () => ({})),
}));

vi.mock("@/mcp/tools/relationships", () => ({
  listRelationships: vi.fn(async () => ({})),
  createRelationship: vi.fn(async () => ({})),
  deleteRelationship: vi.fn(async () => ({})),
}));

vi.mock("@/mcp/tools/export", () => ({
  exportManuscript: vi.fn(async () => ({})),
  exportStoryBible: vi.fn(async () => ({})),
  exportHashnode: vi.fn(async () => ({})),
  getProjectSummary: vi.fn(async () => ({})),
}));

vi.mock("@/mcp/tools/universes", () => ({
  listUniverses: vi.fn(async () => ({})),
  getUniverse: vi.fn(async () => ({})),
  createUniverse: vi.fn(async () => ({})),
  updateUniverse: vi.fn(async () => ({})),
  deleteUniverse: vi.fn(async () => ({})),
  listWorldObjects: vi.fn(async () => ({})),
  getWorldObject: vi.fn(async () => ({})),
  createWorldObject: vi.fn(async () => ({})),
  updateWorldObject: vi.fn(async () => ({})),
  deleteWorldObject: vi.fn(async () => ({})),
  addTimelineEntry: vi.fn(async () => ({})),
  updateTimelineEntry: vi.fn(async () => ({})),
  deleteTimelineEntry: vi.fn(async () => ({})),
  reorderTimelineEntries: vi.fn(async () => ({})),
  transferStoryObjectToUniverse: vi.fn(async () => ({})),
  linkProjectToUniverse: vi.fn(async () => ({})),
  unlinkProjectFromUniverse: vi.fn(async () => ({})),
}));

vi.mock("@/mcp/skills", () => ({
  listSkills: vi.fn(async () => ({})),
}));

vi.mock("@/mcp/tools/coaching", () => ({
  getPlotThreadStatus: vi.fn(async () => ({})),
  getSceneFocus: vi.fn(async () => ({})),
  getManuscriptContext: vi.fn(async () => ({})),
  getConsistencyContext: vi.fn(async () => ({})),
  getVoiceContext: vi.fn(async () => ({})),
}));

vi.mock("@/lib/export/google-docs-exporter", () => ({
  GoogleDocsExporter: { exportToGoogleDocs: vi.fn(async () => ({ googleDocUrl: "https://docs.google.com/test" })) },
}));

const ctx: ToolContext = { userId: "user-A", userEmail: "a@x.test", projectId: "P", role: "OWNER" };

/** FunctionTool.execute is private; runAsync is the public entry point used by the agent loop. */
function callTool(tool: { runAsync: (req: { args: Record<string, unknown>; toolContext: never }) => Promise<unknown> }, args: Record<string, unknown>) {
  return tool.runAsync({ args, toolContext: undefined as never });
}

describe("ADK tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spanAttributes.length = 0;
  });

  describe("tool coverage", () => {
    it("should have an ADK tool for every non-excluded tool definition", () => {
      const registryTools = getAllTools().filter((t) => !isChatExcludedTool(t.name));
      const adkTools = getAllAdkTools(ctx);
      const adkNames = new Set(adkTools.map((t) => t.name));

      for (const def of registryTools) {
        expect(adkNames.has(def.name)).toBe(true);
      }
    });

    it("should have the same total count as non-excluded tool definitions", () => {
      const registryCount = getAllTools().filter((t) => !isChatExcludedTool(t.name)).length;
      const adkCount = getAllAdkTools(ctx).length;
      expect(adkCount).toBe(registryCount);
    });

    it("should preserve tool names and descriptions", () => {
      const registryTools = getAllTools().filter((t) => !isChatExcludedTool(t.name));
      for (const def of registryTools) {
        const adkTool = getAdkToolByName(ctx, def.name);
        expect(adkTool).toMatchObject({ name: expect.any(String), description: expect.any(String) });
        expect(adkTool!.name).toBe(def.name);
        expect(adkTool!.description).toBe(def.description);
      }
    });

    it("should not expose google_auth_* or snapshot/restore tools", () => {
      for (const name of [
        "google_auth_status", "google_auth_connect", "google_auth_callback", "google_auth_disconnect",
        "snapshot_database", "list_snapshots", "restore_snapshot",
      ]) {
        expect(getAdkToolByName(ctx, name)).toBeUndefined();
      }
    });
  });

  describe("category-based access", () => {
    it("should return tools for core category", () => {
      const coreTools = getAdkTools(ctx, ["core"]);
      expect(coreTools.length).toBeGreaterThan(0);

      const registryCoreNames = getAllTools()
        .filter((t) => t.category === "core")
        .map((t) => t.name);
      const adkCoreNames = coreTools.map((t) => t.name);
      expect(adkCoreNames.sort()).toEqual(registryCoreNames.sort());
    });

    it("should return core tools + load_toolset via getCoreAdkTools", () => {
      const coreTools = getCoreAdkTools(ctx);
      const names = coreTools.map((t) => t.name);
      expect(names).toContain("load_toolset");
      expect(names).toContain("list_projects");
      expect(names).toContain("get_project");
    });

    it("should match tool counts per category with non-excluded definitions", () => {
      const categories = getAdkCategories();
      for (const cat of categories) {
        const registryCount = getAllTools().filter((t) => t.category === cat && !isChatExcludedTool(t.name)).length;
        const adkCount = getAdkTools(ctx, [cat]).length;
        expect(adkCount).toBe(registryCount);
      }
    });
  });

  describe("schema parity", () => {
    it("should generate declarations for all tools", () => {
      const allTools = getAllAdkTools(ctx);
      for (const tool of allTools) {
        const decl = tool._getDeclaration();
        expect(decl).toMatchObject({ name: expect.any(String) });
        expect(decl.name).toBe(tool.name);
      }
    });
  });

  describe("load_toolset meta-tool", () => {
    it("should have correct name and description", () => {
      expect(loadToolsetTool.name).toBe("load_toolset");
      expect(loadToolsetTool.description).toContain("Load additional tool categories");
    });

    it("should generate a valid declaration", () => {
      const decl = loadToolsetTool._getDeclaration();
      expect(decl.name).toBe("load_toolset");
    });
  });

  describe("DynamicToolset", () => {
    it("should start with core tools + load_toolset", async () => {
      const toolset = new DynamicToolset(ctx);
      const tools = await toolset.getTools();
      const names = tools.map((t) => t.name);

      expect(names).toContain("list_projects");
      expect(names).toContain("get_project");
      expect(names).toContain("load_toolset");

      expect(names).not.toContain("create_node");
      expect(names).not.toContain("create_universe");
    });

    it("should expand when a category is loaded", async () => {
      const toolset = new DynamicToolset(ctx);
      toolset.loadCategory("structure");

      const tools = await toolset.getTools();
      const names = tools.map((t) => t.name);

      expect(names).toContain("create_node");
      expect(names).toContain("update_node");
      expect(names).toContain("delete_node");
      expect(names).toContain("list_projects");
    });

    it("should load multiple categories", async () => {
      const toolset = new DynamicToolset(ctx);
      toolset.loadCategory("structure");
      toolset.loadCategory("world_building");

      const tools = await toolset.getTools();
      const names = tools.map((t) => t.name);

      expect(names).toContain("create_node");
      expect(names).toContain("list_universes");
    });

    it("should reset to core only", async () => {
      const toolset = new DynamicToolset(ctx);
      toolset.loadCategory("structure");
      toolset.reset();

      const tools = await toolset.getTools();
      const names = tools.map((t) => t.name);

      expect(names).not.toContain("create_node");
      expect(names).toContain("list_projects");
    });

    it("should report loaded categories", () => {
      const toolset = new DynamicToolset(ctx);
      expect(toolset.getLoadedCategories()).toEqual(new Set(["core"]));

      toolset.loadCategory("export");
      expect(toolset.getLoadedCategories()).toEqual(new Set(["core", "export"]));
    });

    it("never includes admin credential/snapshot tools even when admin is loaded", async () => {
      const toolset = new DynamicToolset(ctx);
      toolset.loadCategory("admin");

      const tools = await toolset.getTools();
      const names = tools.map((t) => t.name);

      expect(names).toContain("create_project");
      for (const name of ["snapshot_database", "list_snapshots", "restore_snapshot", "google_auth_status", "google_auth_disconnect"]) {
        expect(names).not.toContain(name);
      }
    });
  });

  describe("chat tool scoping (SEC-01)", () => {
    it("rejects get_project for a different projectId", async () => {
      const tool = getAdkToolByName(ctx, "get_project")!;
      await expect(callTool(tool, { projectId: "Q" })).rejects.toThrow(/Forbidden/);
    });

    it("allows get_project for the pinned projectId", async () => {
      const tool = getAdkToolByName(ctx, "get_project")!;
      await expect(callTool(tool, { projectId: "P" })).resolves.toBeDefined();
    });

    it("rejects read_scene_content for a node outside the pinned project", async () => {
      const tool = getAdkToolByName(ctx, "read_scene_content")!;
      await expect(callTool(tool, { nodeId: "node-in-Q" })).rejects.toThrow(/Forbidden/);
    });

    it("allows read_scene_content for a node inside the pinned project", async () => {
      const tool = getAdkToolByName(ctx, "read_scene_content")!;
      await expect(callTool(tool, { nodeId: "node-in-P" })).resolves.toBeDefined();
    });

    it("scopes get_open_annotations to the pinned project regardless of args", async () => {
      const { getOpenAnnotations } = await import("@/mcp/tools/structure");
      const tool = getAdkToolByName(ctx, "get_open_annotations")!;
      await callTool(tool, { projectId: "Q" });
      expect(getOpenAnnotations).toHaveBeenCalledWith("P");
    });

    it("scopes list_projects to just the pinned project", async () => {
      const tool = getAdkToolByName(ctx, "list_projects")!;
      const result = (await callTool(tool, {})) as { projects: unknown[]; total: number };
      expect(result.total).toBe(1);
      expect(result.projects).toHaveLength(1);
    });

    it("requires OWNER for export_to_google_docs", async () => {
      const editorCtx: ToolContext = { ...ctx, role: "EDITOR" };
      const tool = getAdkToolByName(editorCtx, "export_to_google_docs")!;
      await expect(callTool(tool, { projectId: "P", exportMode: "STORY_READER" })).rejects.toThrow(/owner/);
    });

    it("allows OWNER to export_to_google_docs the pinned project", async () => {
      const tool = getAdkToolByName(ctx, "export_to_google_docs")!;
      await expect(callTool(tool, { projectId: "P", exportMode: "STORY_READER" })).resolves.toBeDefined();
    });
  });

  describe("chat destructive gating (WCA-032 parity)", () => {
    let saved: string | undefined;
    beforeEach(() => {
      saved = process.env.MCP_ALLOW_DESTRUCTIVE;
      delete process.env.MCP_ALLOW_DESTRUCTIVE;
    });
    afterEach(() => {
      if (saved === undefined) delete process.env.MCP_ALLOW_DESTRUCTIVE;
      else process.env.MCP_ALLOW_DESTRUCTIVE = saved;
    });

    it("blocks delete_node when MCP_ALLOW_DESTRUCTIVE is unset", async () => {
      const { deleteNode } = await import("@/mcp/tools/structure");
      const tool = getAdkToolByName(ctx, "delete_node")!;
      await expect(callTool(tool, { nodeId: "node-in-P" })).rejects.toThrow(/MCP_ALLOW_DESTRUCTIVE/);
      expect(deleteNode).not.toHaveBeenCalled();
    });

    it("allows delete_node when MCP_ALLOW_DESTRUCTIVE=true", async () => {
      process.env.MCP_ALLOW_DESTRUCTIVE = "true";
      const { deleteNode } = await import("@/mcp/tools/structure");
      const tool = getAdkToolByName(ctx, "delete_node")!;
      await expect(callTool(tool, { nodeId: "node-in-P" })).resolves.toBeDefined();
      expect(deleteNode).toHaveBeenCalledWith("node-in-P");
    });

    it("gates every chat delete_ tool", () => {
      const deletes = getAllAdkTools(ctx).map((t) => t.name).filter((n) => n.startsWith("delete_"));
      expect(deletes.length).toBeGreaterThan(0);
      for (const name of deletes) expect(isChatDestructiveTool(name)).toBe(true);
    });

    it("leaves non-destructive writes working when the gate is off", async () => {
      const tool = getAdkToolByName(ctx, "create_node")!;
      await expect(callTool(tool, { projectId: "P", type: "SCENE", title: "x" })).resolves.toBeDefined();
    });
  });

  describe("chat stale-write protection (WCA-053)", () => {
    it("passes contentHash through write_scene_content", async () => {
      const { writeSceneContent } = await import("@/mcp/tools/structure");
      const tool = getAdkToolByName(ctx, "write_scene_content")!;
      await callTool(tool, { nodeId: "node-in-P", content: "x", contentHash: "h" });
      expect(writeSceneContent).toHaveBeenCalledWith("node-in-P", "x", "h");
    });

    it("rejects write_scene_content without contentHash", async () => {
      const { writeSceneContent } = await import("@/mcp/tools/structure");
      const tool = getAdkToolByName(ctx, "write_scene_content")!;
      await expect(callTool(tool, { nodeId: "node-in-P", content: "x" })).rejects.toThrow();
      expect(writeSceneContent).not.toHaveBeenCalled();
    });

    it("passes contentHash to update_node separately from the update data", async () => {
      const { updateNode } = await import("@/mcp/tools/structure");
      const tool = getAdkToolByName(ctx, "update_node")!;
      await callTool(tool, { nodeId: "node-in-P", title: "t", contentHash: "h" });
      expect(updateNode).toHaveBeenCalledWith("node-in-P", { title: "t" }, "h");
    });

    it("passes contentHash through update_project", async () => {
      const { updateProject } = await import("@/mcp/tools/projects");
      const tool = getAdkToolByName(ctx, "update_project")!;
      await callTool(tool, { projectId: "P", title: "t", contentHash: "h" });
      expect(updateProject).toHaveBeenCalledWith(null, "P", { title: "t" }, "h");
    });

    it("passes contentHash to update_story_object separately from the update data", async () => {
      const { updateStoryObject } = await import("@/mcp/tools/story-objects");
      const tool = getAdkToolByName(ctx, "update_story_object")!;
      await callTool(tool, { objectId: "obj-1", name: "n", contentHash: "h" });
      expect(updateStoryObject).toHaveBeenCalledWith("obj-1", { name: "n" }, "h");
    });

    it("passes contentHash to update_universe separately from the update data", async () => {
      const { updateUniverse } = await import("@/mcp/tools/universes");
      const tool = getAdkToolByName(ctx, "update_universe")!;
      await callTool(tool, { universeId: "U", title: "t", contentHash: "h" });
      expect(updateUniverse).toHaveBeenCalledWith("U", { title: "t" }, "h");
    });

    it("passes contentHash to update_world_object separately from the update data", async () => {
      const { updateWorldObject } = await import("@/mcp/tools/universes");
      const tool = getAdkToolByName(ctx, "update_world_object")!;
      await callTool(tool, { objectId: "wo-1", name: "n", contentHash: "h" });
      expect(updateWorldObject).toHaveBeenCalledWith("wo-1", { name: "n" }, "h");
    });

    it("passes contentHash to update_timeline_entry separately from the update data", async () => {
      const { updateTimelineEntry } = await import("@/mcp/tools/universes");
      const tool = getAdkToolByName(ctx, "update_timeline_entry")!;
      await callTool(tool, { entryId: "te-1", label: "l", contentHash: "h" });
      expect(updateTimelineEntry).toHaveBeenCalledWith("te-1", { label: "l" }, "h");
    });
  });

  describe("tool span attributes (SEC-09)", () => {
    it("records input/output lengths, never tool content", async () => {
      const { readSceneContent } = await import("@/mcp/tools/structure");
      const scene = { content: "<p>SECRET MANUSCRIPT TEXT</p>" };
      vi.mocked(readSceneContent).mockResolvedValueOnce(scene as never);
      const tool = getAdkToolByName(ctx, "read_scene_content")!;

      await callTool(tool, { nodeId: "node-in-P" });

      const attrs = new Map(spanAttributes);
      expect(attrs.has("tool.input")).toBe(false);
      expect(attrs.has("tool.output")).toBe(false);
      for (const [, value] of spanAttributes) {
        if (typeof value === "string") {
          expect(value).not.toContain("SECRET MANUSCRIPT");
          expect(value).not.toContain("node-in-P");
        }
      }
      expect(attrs.get("tool.output_length")).toBe(JSON.stringify(scene).length);
      expect(attrs.get("tool.input_length")).toBeGreaterThan(0);
    });
  });
});
