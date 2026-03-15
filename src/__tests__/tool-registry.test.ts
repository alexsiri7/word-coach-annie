import { describe, it, expect } from "vitest";
import {
    getCoreTools,
    getToolDefinitions,
    getToolByName,
    getAllTools,
    LOAD_TOOLSET_DEFINITION,
    type ToolCategory,
} from "@/lib/ai/tool-registry";

describe("Tool Registry", () => {
    describe("getCoreTools", () => {
        it("returns ~8 core tool definitions plus load_toolset", () => {
            const coreTools = getCoreTools();

            // Should have core tools + load_toolset
            expect(coreTools.length).toBeGreaterThanOrEqual(8);
            expect(coreTools.length).toBeLessThanOrEqual(12);

            // All should be in OpenAI function format
            for (const tool of coreTools) {
                expect(tool.type).toBe("function");
                expect(tool.function.name).toBeTruthy();
                expect(tool.function.description).toBeTruthy();
                expect(tool.function.parameters).toBeDefined();
            }
        });

        it("includes the load_toolset meta-tool", () => {
            const coreTools = getCoreTools();
            const loadToolset = coreTools.find((t) => t.function.name === "load_toolset");
            expect(loadToolset).toBeDefined();
            expect(loadToolset!.function.parameters).toHaveProperty("properties.category");
        });

        it("includes expected core tools", () => {
            const coreTools = getCoreTools();
            const names = coreTools.map((t) => t.function.name);

            expect(names).toContain("list_projects");
            expect(names).toContain("get_project");
            expect(names).toContain("get_outline");
            expect(names).toContain("read_scene_content");
            expect(names).toContain("list_story_objects");
            expect(names).toContain("get_project_summary");
            expect(names).toContain("get_open_annotations");
            expect(names).toContain("list_skills");
        });
    });

    describe("getToolDefinitions", () => {
        it("returns structure tools for the structure category", () => {
            const structureTools = getToolDefinitions(["structure"]);
            expect(structureTools.length).toBeGreaterThan(0);

            const names = structureTools.map((t) => t.function.name);
            expect(names).toContain("create_node");
            expect(names).toContain("update_node");
            expect(names).toContain("delete_node");
            expect(names).toContain("write_scene_content");
        });

        it("returns character tools for the characters category", () => {
            const charTools = getToolDefinitions(["characters"]);
            expect(charTools.length).toBeGreaterThan(0);

            const names = charTools.map((t) => t.function.name);
            expect(names).toContain("create_story_object");
            expect(names).toContain("list_relationships");
        });

        it("returns world_building tools", () => {
            const worldTools = getToolDefinitions(["world_building"]);
            expect(worldTools.length).toBeGreaterThan(0);

            const names = worldTools.map((t) => t.function.name);
            expect(names).toContain("list_universes");
            expect(names).toContain("create_world_object");
            expect(names).toContain("add_timeline_entry");
        });

        it("returns export tools", () => {
            const exportTools = getToolDefinitions(["export"]);
            const names = exportTools.map((t) => t.function.name);
            expect(names).toContain("export_manuscript");
            expect(names).toContain("export_story_bible");
        });

        it("returns admin tools", () => {
            const adminTools = getToolDefinitions(["admin"]);
            const names = adminTools.map((t) => t.function.name);
            expect(names).toContain("create_project");
            expect(names).toContain("snapshot_database");
        });

        it("can combine multiple categories", () => {
            const combined = getToolDefinitions(["structure", "characters"]);
            const structureOnly = getToolDefinitions(["structure"]);
            const charsOnly = getToolDefinitions(["characters"]);

            expect(combined.length).toBe(structureOnly.length + charsOnly.length);
        });

        it("returns empty array for empty categories", () => {
            const empty = getToolDefinitions([]);
            expect(empty).toEqual([]);
        });

        it("produces valid OpenAI tool format", () => {
            const allCategories: ToolCategory[] = ["core", "structure", "characters", "world_building", "export", "admin"];
            const allTools = getToolDefinitions(allCategories);

            for (const tool of allTools) {
                expect(tool.type).toBe("function");
                expect(typeof tool.function.name).toBe("string");
                expect(typeof tool.function.description).toBe("string");
                expect(tool.function.parameters).toHaveProperty("type", "object");
                expect(tool.function.parameters).toHaveProperty("properties");
            }
        });
    });

    describe("getToolByName", () => {
        it("finds a tool by name", () => {
            const tool = getToolByName("list_projects");
            expect(tool).toBeDefined();
            expect(tool!.name).toBe("list_projects");
            expect(tool!.category).toBe("core");
        });

        it("returns undefined for unknown tool", () => {
            const tool = getToolByName("nonexistent_tool");
            expect(tool).toBeUndefined();
        });
    });

    describe("LOAD_TOOLSET_DEFINITION", () => {
        it("has the correct structure", () => {
            expect(LOAD_TOOLSET_DEFINITION.type).toBe("function");
            expect(LOAD_TOOLSET_DEFINITION.function.name).toBe("load_toolset");
            expect(LOAD_TOOLSET_DEFINITION.function.parameters).toHaveProperty("properties.category");

            const catProp = (LOAD_TOOLSET_DEFINITION.function.parameters as Record<string, unknown> & {
                properties: { category: { enum: string[] } };
            }).properties.category;
            expect(catProp.enum).toContain("structure");
            expect(catProp.enum).toContain("characters");
            expect(catProp.enum).toContain("world_building");
            expect(catProp.enum).not.toContain("core"); // core is always loaded
        });
    });

    describe("getAllTools", () => {
        it("returns all registered tools", () => {
            const all = getAllTools();
            expect(all.length).toBeGreaterThan(40); // We registered 50+ tools
        });

        it("has no duplicate tool names", () => {
            const all = getAllTools();
            const names = all.map((t) => t.name);
            const unique = new Set(names);
            expect(unique.size).toBe(names.length);
        });
    });
});

describe("Tool Executor", () => {
    // We test executeTool's routing and error handling without hitting the DB.
    // The tool functions themselves are tested in their own test suites.

    it("returns error for unknown tool names", async () => {
        const { executeTool } = await import("@/lib/ai/tool-executor");
        const result = await executeTool("nonexistent_tool", {});
        const parsed = JSON.parse(result);
        expect(parsed.error).toBe(true);
        expect(parsed.message).toContain("Unknown tool");
        expect(parsed.availableTools).toBeDefined();
        expect(Array.isArray(parsed.availableTools)).toBe(true);
    });

    it("routes list_skills correctly (no DB needed)", async () => {
        const { executeTool } = await import("@/lib/ai/tool-executor");
        // list_skills reads from filesystem, not DB — should return an array
        const result = await executeTool("list_skills", {});
        const parsed = JSON.parse(result);
        expect(Array.isArray(parsed)).toBe(true);
    });

    it("catches and returns controller errors as structured responses", async () => {
        const { executeTool } = await import("@/lib/ai/tool-executor");
        // Calling get_project with a non-existent ID should produce an error
        const result = await executeTool("get_project", { projectId: "nonexistent-id-xyz" });
        const parsed = JSON.parse(result);
        // Either returns null/error from prisma - the point is it doesn't throw
        expect(typeof parsed).not.toBe("undefined");
    });
});
