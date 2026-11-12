import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

describe("MCP Server", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("creates a server with all tools registered", async () => {
        const { createServer } = await import("../mcp/index");
        const server = createServer({ allowDestructive: true });
        expect(server).toBeDefined();
    });

    it("does not register database snapshot/restore tools", async () => {
        const { createServer } = await import("../mcp/index");
        const server = createServer({ allowDestructive: true });
        const tools = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
        for (const name of ["snapshot_database", "list_snapshots", "restore_snapshot"]) {
            expect(tools).not.toHaveProperty(name);
        }
        expect(tools).toHaveProperty("get_scene_versions");
        expect(tools).toHaveProperty("restore_scene_version");
    });

    it("creates a server with destructive tools disabled", async () => {
        const { createServer } = await import("../mcp/index");
        const server = createServer({ allowDestructive: false });
        expect(server).toBeDefined();
    });

    it("creates a server with default options", async () => {
        const { createServer } = await import("../mcp/index");
        const server = createServer();
        expect(server).toBeDefined();
    });
});

describe("MCP tools for personal API tokens", () => {
    async function registeredTools(tokenScope?: "read" | "write") {
        const { createServer } = await import("../mcp/index");
        const server = createServer({ userId: "u", allowDestructive: true, tokenScope });
        return Object.keys((server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools).sort();
    }

    it("registers only the scene-reading tools for a read token", async () => {
        expect(await registeredTools("read")).toEqual(
            ["get_outline", "get_project", "get_scene_versions", "list_projects", "read_scene_content"]
        );
    });

    it("adds the scene-writing tools for a write token", async () => {
        expect(await registeredTools("write")).toEqual([
            "delete_beat",
            "get_outline",
            "get_project",
            "get_scene_versions",
            "insert_beat",
            "list_projects",
            "read_scene_content",
            "restore_scene_version",
            "update_paragraph",
            "write_scene_content",
        ]);
    });

    it("registers every tool without a token scope", async () => {
        const tools = await registeredTools();
        expect(tools).toContain("delete_beat");
        expect(tools).toContain("create_project");
        expect(tools.length).toBeGreaterThan(90);
    });
});

describe("MCP URL arguments", () => {
    const opportunity = { providerId: "p", title: "Prize", closeDate: "2030-04-01T00:00:00.000Z" };
    const contest = { projectId: "x", providerId: "p", contestName: "Prize", submissionDate: "2030-04-01T00:00:00.000Z" };
    const cases = [
        { tool: "create_opportunity", base: opportunity, field: "rulesUrl" },
        { tool: "update_opportunity", base: { opportunityId: "o" }, field: "rulesUrl" },
        { tool: "create_provider", base: { name: "Org" }, field: "website" },
        { tool: "update_provider", base: { providerId: "p" }, field: "website" },
        { tool: "create_contest_submission", base: contest, field: "submissionUrl" },
        { tool: "update_contest_submission", base: { submissionId: "s" }, field: "submissionUrl" },
    ];

    async function connect() {
        const { createServer } = await import("../mcp/index");
        const server = createServer({ userId: "u", allowDestructive: true });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: "test", version: "1.0.0" });
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        return client;
    }

    it.each(cases)("$tool refuses a javascript: $field before the tool runs", async ({ tool, base, field }) => {
        const client = await connect();
        const result = await client.callTool({ name: tool, arguments: { ...base, [field]: "javascript:alert(1)" } });
        expect(result.isError).toBe(true);
        const [content] = result.content as Array<{ text: string }>;
        expect(content.text).toContain(`Invalid arguments for tool ${tool}: must be an absolute http(s) URL at ${field}`);
        await client.close();
    });
});
