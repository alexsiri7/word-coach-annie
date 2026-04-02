import { describe, it, expect } from "vitest";
import {
  getAllAdkTools,
  getAdkTools,
  getCoreAdkTools,
  getAdkToolByName,
  getAdkCategories,
  loadToolsetTool,
  DynamicToolset,
  getAllTools,
} from "@/lib/ai/adk-tools";

describe("ADK tools", () => {
  describe("tool coverage", () => {
    it("should have an ADK tool for every tool definition", () => {
      const registryTools = getAllTools();
      const adkTools = getAllAdkTools();
      const adkNames = new Set(adkTools.map((t) => t.name));

      for (const def of registryTools) {
        expect(adkNames.has(def.name)).toBe(true);
      }
    });

    it("should have the same total count as tool definitions", () => {
      const registryCount = getAllTools().length;
      const adkCount = getAllAdkTools().length;
      expect(adkCount).toBe(registryCount);
    });

    it("should preserve tool names and descriptions", () => {
      const registryTools = getAllTools();
      for (const def of registryTools) {
        const adkTool = getAdkToolByName(def.name);
        expect(adkTool).toBeDefined();
        expect(adkTool!.name).toBe(def.name);
        expect(adkTool!.description).toBe(def.description);
      }
    });
  });

  describe("category-based access", () => {
    it("should return tools for core category", () => {
      const coreTools = getAdkTools(["core"]);
      expect(coreTools.length).toBeGreaterThan(0);

      // Verify all core tools are actually core
      const registryCoreNames = getAllTools()
        .filter((t) => t.category === "core")
        .map((t) => t.name);
      const adkCoreNames = coreTools.map((t) => t.name);
      expect(adkCoreNames.sort()).toEqual(registryCoreNames.sort());
    });

    it("should return core tools + load_toolset via getCoreAdkTools", () => {
      const coreTools = getCoreAdkTools();
      const names = coreTools.map((t) => t.name);
      expect(names).toContain("load_toolset");
      expect(names).toContain("list_projects");
      expect(names).toContain("get_project");
    });

    it("should match tool counts per category with definitions", () => {
      const categories = getAdkCategories();
      for (const cat of categories) {
        const registryCount = getAllTools().filter((t) => t.category === cat).length;
        const adkCount = getAdkTools([cat]).length;
        expect(adkCount).toBe(registryCount);
      }
    });
  });

  describe("schema parity", () => {
    it("should generate declarations for all tools", () => {
      const allTools = getAllAdkTools();
      for (const tool of allTools) {
        const decl = tool._getDeclaration();
        expect(decl).toBeDefined();
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
      const toolset = new DynamicToolset();
      const tools = await toolset.getTools();
      const names = tools.map((t) => t.name);

      // Should have core tools
      expect(names).toContain("list_projects");
      expect(names).toContain("get_project");
      expect(names).toContain("load_toolset");

      // Should NOT have non-core tools
      expect(names).not.toContain("create_node");
      expect(names).not.toContain("create_universe");
    });

    it("should expand when a category is loaded", async () => {
      const toolset = new DynamicToolset();
      toolset.loadCategory("structure");

      const tools = await toolset.getTools();
      const names = tools.map((t) => t.name);

      expect(names).toContain("create_node");
      expect(names).toContain("update_node");
      expect(names).toContain("delete_node");
      // Core tools still present
      expect(names).toContain("list_projects");
    });

    it("should load multiple categories", async () => {
      const toolset = new DynamicToolset();
      toolset.loadCategory("structure");
      toolset.loadCategory("world_building");

      const tools = await toolset.getTools();
      const names = tools.map((t) => t.name);

      expect(names).toContain("create_node");
      expect(names).toContain("list_universes");
    });

    it("should reset to core only", async () => {
      const toolset = new DynamicToolset();
      toolset.loadCategory("structure");
      toolset.reset();

      const tools = await toolset.getTools();
      const names = tools.map((t) => t.name);

      expect(names).not.toContain("create_node");
      expect(names).toContain("list_projects");
    });

    it("should report loaded categories", () => {
      const toolset = new DynamicToolset();
      expect(toolset.getLoadedCategories()).toEqual(new Set(["core"]));

      toolset.loadCategory("export");
      expect(toolset.getLoadedCategories()).toEqual(new Set(["core", "export"]));
    });
  });

  describe("write_scene_content enforcement", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exec = (args: Record<string, unknown>) =>
      (getAdkToolByName("write_scene_content") as any).execute(args);

    it("should reject CONTENT blocks", async () => {
      expect(getAdkToolByName("write_scene_content")).toBeDefined();

      await expect(
        exec({
          nodeId: "fake-node",
          blocks: [
            { type: "CONTENT", content: "<p>Some prose Annie should not write</p>" },
          ],
        })
      ).rejects.toThrow("REJECTED: Annie does not write CONTENT blocks");
    });

    it("should reject mixed blocks containing CONTENT", async () => {
      await expect(
        exec({
          nodeId: "fake-node",
          blocks: [
            { type: "BEAT", content: "Opening — character enters" },
            { type: "CONTENT", content: "<p>She walked into the room.</p>" },
            { type: "BEAT", content: "Closing — tension rises" },
          ],
        })
      ).rejects.toThrow("REJECTED: Annie does not write CONTENT blocks");
    });

    it("should reject when blocks are missing", async () => {
      await expect(
        exec({ nodeId: "fake-node" })
      ).rejects.toThrow("Annie must use structured BEAT blocks");
    });

    it("should reject empty blocks array", async () => {
      await expect(
        exec({ nodeId: "fake-node", blocks: [] })
      ).rejects.toThrow("Annie must use structured BEAT blocks");
    });

    it("should only accept BEAT in the schema", () => {
      const tool = getAdkToolByName("write_scene_content");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const decl = (tool as any)._getDeclaration();
      expect(decl.description).toContain("BEAT blocks only");
      expect(decl.description).not.toContain("HTML string");
    });
  });
});
