import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/db";

vi.mock("../mcp/snapshot", () => ({
    initSnapshotRepo: vi.fn(),
    createSnapshot: vi.fn(() => ({ hash: "abc123", message: "test" })),
    listSnapshots: vi.fn(() => []),
    restoreSnapshot: vi.fn(() => ({ hash: "def456", message: "restored" })),
    autoSnapshot: vi.fn(),
}));

type ToolResult = { isError?: boolean; content: Array<{ text: string }> };

async function callTool(userId: string | null, name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const { createServer } = await import("../mcp/index");
    const server: McpServer = createServer({ userId, allowDestructive: false });
    const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<ToolResult> }> })._registeredTools;
    return tools[name].handler(args);
}

describe("MCP writing task ownership", () => {
    let taskId: string;

    beforeEach(async () => {
        await prisma.user.create({ data: { id: "owner-a", email: "owner-a@test.com", googleId: "g-owner-a" } });
        await prisma.user.create({ data: { id: "other-b", email: "other-b@test.com", googleId: "g-other-b" } });
        const created = await callTool("owner-a", "create_writing_task", { name: "A's practice task" });
        expect(created.isError).toBeUndefined();
        taskId = JSON.parse(created.content[0].text).id;
    });

    it("rejects another user's update of a practice task and leaves it unchanged", async () => {
        const result = await callTool("other-b", "update_writing_task", { taskId, name: "Hijacked" });
        expect(result.isError).toBe(true);

        const row = await prisma.writingTask.findUnique({ where: { id: taskId } });
        expect(row?.name).toBe("A's practice task");
    });

    it("rejects another user's completion of a practice task", async () => {
        const result = await callTool("other-b", "complete_writing_task", { taskId });
        expect(result.isError).toBe(true);

        const row = await prisma.writingTask.findUnique({ where: { id: taskId } });
        expect(row?.completed).toBe(false);
    });

    it("lets the owner update and complete their practice task", async () => {
        const updated = await callTool("owner-a", "update_writing_task", { taskId, kind: "Gather" });
        expect(updated.isError).toBeUndefined();
        expect(JSON.parse(updated.content[0].text).kind).toBe("Gather");

        const completed = await callTool("owner-a", "complete_writing_task", { taskId });
        expect(completed.isError).toBeUndefined();
        expect(JSON.parse(completed.content[0].text).completed).toBe(true);
    });

    it("lets single-user mode (no userId) update any practice task", async () => {
        const result = await callTool(null, "update_writing_task", { taskId, capacity: "Low" });
        expect(result.isError).toBeUndefined();
        expect(JSON.parse(result.content[0].text).capacity).toBe("Low");
    });

    it("rejects updating a project task in a project the caller does not own", async () => {
        const project = await prisma.project.create({ data: { title: "A's novel", userId: "owner-a" } });
        const created = await callTool("owner-a", "create_writing_task", { projectId: project.id, name: "Project task" });
        const projectTaskId = JSON.parse(created.content[0].text).id;

        const result = await callTool("other-b", "update_writing_task", { taskId: projectTaskId, name: "Hijacked" });
        expect(result.isError).toBe(true);
    });

    it("does not list another user's practice tasks", async () => {
        const result = await callTool("other-b", "list_writing_tasks", {});
        expect(result.isError).toBeUndefined();
        expect(JSON.parse(result.content[0].text).tasks).toEqual([]);

        const own = await callTool("owner-a", "list_writing_tasks", {});
        expect(JSON.parse(own.content[0].text).tasks.map((t: { id: string }) => t.id)).toEqual([taskId]);
    });
});
