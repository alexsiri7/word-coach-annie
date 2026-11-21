import { describe, it, expect } from "vitest";
import { createServer } from "@/mcp/index";
import { getAllAdkTools, loadToolsetTool } from "@/lib/ai/adk-tools";
import { CHAT_TOOL_SPECS, TOOL_SPECS } from "@/lib/ai/tool-catalog";
import { TOKEN_SCOPE_TOOLS } from "@/mcp/token-scopes";
import { DESTRUCTIVE_TOOL_DISABLED_MESSAGE } from "@/lib/env";

type RegisteredTool = {
    description?: string;
    inputSchema?: { shape: Record<string, unknown> };
    handler: (args: unknown, extra?: unknown) => Promise<{ isError?: boolean; content: { text: string }[] }>;
};

function registeredTools(allowDestructive: boolean): Record<string, RegisteredTool> {
    const server = createServer({ allowDestructive });
    return (server as unknown as { _registeredTools: Record<string, RegisteredTool> })._registeredTools;
}

const specsByName = new Map(TOOL_SPECS.map((spec) => [spec.name, spec]));

describe("AI tool catalog", () => {
    it("defines each tool name once", () => {
        expect(specsByName.size).toBe(TOOL_SPECS.length);
    });

    it("registers exactly the catalog's tools on MCP", () => {
        expect(Object.keys(registeredTools(true)).sort()).toEqual([...specsByName.keys()].sort());
    });

    it("registers every MCP tool from its catalog spec object", () => {
        for (const [name, tool] of Object.entries(registeredTools(true))) {
            const spec = specsByName.get(name)!;
            expect(tool.description).toBe(spec.description);
            const shape = spec.parameters.shape;
            expect(Object.keys(tool.inputSchema?.shape ?? {})).toEqual(Object.keys(shape));
            for (const key of Object.keys(shape)) expect(tool.inputSchema!.shape[key]).toBe(shape[key]);
        }
    });

    it("builds every chat tool from a catalog spec", () => {
        const ctx = { userId: "u", userEmail: null, projectId: "p", role: "OWNER" as const };
        const chatTools = getAllAdkTools(ctx).filter((tool) => tool !== loadToolsetTool);
        expect(chatTools.map((tool) => tool.name).sort()).toEqual(CHAT_TOOL_SPECS.map((spec) => spec.name).sort());
        for (const tool of chatTools) {
            expect(tool.description).toBe(specsByName.get(tool.name)!.description);
        }
    });

    it("allowlists only catalog tools for personal API token scopes", () => {
        for (const names of Object.values(TOKEN_SCOPE_TOOLS)) {
            for (const name of names) expect(specsByName.has(name)).toBe(true);
        }
    });

    it("caps reorder_timeline_entries.orderedIds at 500 entries", () => {
        const spec = specsByName.get("reorder_timeline_entries")!;
        const tooMany = Array.from({ length: 501 }, (_, i) => `id-${i}`);
        expect(spec.parameters.safeParse({ worldObjectId: "wo-1", orderedIds: tooMany }).success).toBe(false);
        expect(spec.parameters.safeParse({ worldObjectId: "wo-1", orderedIds: tooMany.slice(0, 500) }).success).toBe(true);
    });

    it("refuses every destructive MCP tool before its handler runs when destructive tools are off", async () => {
        const tools = registeredTools(false);
        const destructive = TOOL_SPECS.filter((spec) => spec.destructive);
        expect(destructive.length).toBeGreaterThan(0);
        for (const spec of destructive) {
            const result = await tools[spec.name].handler({});
            expect(result).toEqual({ content: [{ type: "text", text: DESTRUCTIVE_TOOL_DISABLED_MESSAGE }], isError: true });
        }
    });
});
