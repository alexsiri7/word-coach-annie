import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// Mock snapshot module to avoid filesystem operations
vi.mock("../mcp/snapshot", () => ({
    initSnapshotRepo: vi.fn(),
    createSnapshot: vi.fn(() => ({ hash: "abc123", message: "test" })),
    listSnapshots: vi.fn(() => []),
    restoreSnapshot: vi.fn(() => ({ hash: "def456", message: "restored" })),
    autoSnapshot: vi.fn(),
}));

describe("MCP Server", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("creates a server with all tools registered", async () => {
        const { createServer } = await import("../mcp/index");
        const server = createServer({ allowDestructive: true });
        expect(server).toBeDefined();
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
