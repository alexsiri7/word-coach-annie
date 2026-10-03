import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/db";
import { createWritingTask } from "@/mcp/tools/writing-tasks";

vi.mock("../mcp/snapshot", () => ({
    initSnapshotRepo: vi.fn(),
    createSnapshot: vi.fn(() => ({ hash: "abc123", message: "test" })),
    listSnapshots: vi.fn(() => []),
    restoreSnapshot: vi.fn(() => ({ hash: "def456", message: "restored" })),
    autoSnapshot: vi.fn(),
}));

type ToolResult = { isError?: boolean; content: Array<{ text: string }> };
type Named = { name: string };
type Deadline = { type: "task" | "opportunity"; title: string; date: string };

async function callTool(userId: string | null, name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const { createServer } = await import("../mcp/index");
    const server: McpServer = createServer({ userId, allowDestructive: false });
    const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<ToolResult> }> })._registeredTools;
    return tools[name].handler(args);
}

async function dashboard(userId: string | null, args: Record<string, unknown> = {}) {
    const result = await callTool(userId, "get_task_dashboard", args);
    expect(result.isError).toBeUndefined();
    return JSON.parse(result.content[0].text);
}

const names = (tasks: Named[]) => tasks.map((t) => t.name).sort();

function daysFromNow(days: number): Date {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

describe("get_task_dashboard", () => {
    const userId = "dash-user";
    let novelId: string;
    let storyId: string;

    beforeEach(async () => {
        await prisma.user.create({ data: { id: userId, email: "dash@test.com", googleId: "g-dash" } });
        await prisma.user.create({ data: { id: "dash-other", email: "dash-other@test.com", googleId: "g-dash-other" } });
        novelId = (await prisma.project.create({ data: { title: "Novel", userId } })).id;
        storyId = (await prisma.project.create({ data: { title: "Story", userId } })).id;
    });

    it("gathers open tasks from every project and practice tasks, tagged with their project and scene", async () => {
        const scene = await prisma.structureNode.create({
            data: { projectId: novelId, type: "SCENE", title: "Opening" },
        });
        await createWritingTask({ projectId: novelId, userId, sceneId: scene.id, name: "Fix opening" });
        await createWritingTask({ projectId: storyId, userId, name: "Tighten ending" });
        await createWritingTask({ userId, name: "Morning pages" });
        await createWritingTask({ userId: "dash-other", name: "Someone else's task" });

        const result = await dashboard(userId);

        expect(result.openTaskTotal).toBe(3);
        const byName = Object.fromEntries(result.openTasks.map((t: Named) => [t.name, t]));
        expect(byName["Fix opening"].project).toEqual({ id: novelId, title: "Novel" });
        expect(byName["Fix opening"].scene).toEqual({ id: scene.id, title: "Opening" });
        expect(byName["Tighten ending"].project).toEqual({ id: storyId, title: "Story" });
        expect(byName["Morning pages"].project).toBeNull();
    });

    it("narrows to one project", async () => {
        await createWritingTask({ projectId: novelId, userId, name: "Novel task" });
        await createWritingTask({ projectId: storyId, userId, name: "Story task" });
        await createWritingTask({ userId, name: "Practice task" });

        const result = await dashboard(userId, { projectId: novelId });
        expect(names(result.openTasks)).toEqual(["Novel task"]);
    });

    it("keeps tasks at or below the given capacity and of the given kind, and suggests from them", async () => {
        await createWritingTask({ userId, name: "Draft chapter", kind: "Draft", capacity: "Full", importance: "Critical" });
        await createWritingTask({ userId, name: "Revise scene", kind: "Revise", capacity: "Medium" });
        await createWritingTask({ userId, name: "Read comps", kind: "Read", capacity: "Low" });

        const medium = await dashboard(userId, { capacity: "Medium" });
        expect(names(medium.openTasks)).toEqual(["Read comps", "Revise scene"]);
        expect(names(medium.suggestedNow)).toEqual(["Read comps", "Revise scene"]);

        const low = await dashboard(userId, { capacity: "Low" });
        expect(names(low.suggestedNow)).toEqual(["Read comps"]);

        const read = await dashboard(userId, { kind: "Read" });
        expect(names(read.openTasks)).toEqual(["Read comps"]);
    });

    it("ranks suggestions by importance, then due date", async () => {
        await createWritingTask({ userId, name: "Medium", importance: "Medium" });
        await createWritingTask({ userId, name: "High, due later", importance: "High", dueDate: daysFromNow(20).toISOString() });
        await createWritingTask({ userId, name: "High, due soon", importance: "High", dueDate: daysFromNow(2).toISOString() });

        const result = await dashboard(userId);
        const ranked = ["High, due soon", "High, due later", "Medium"];
        expect(result.suggestedNow.map((t: Named) => t.name)).toEqual(ranked);
        expect(result.openTasks.map((t: Named) => t.name)).toEqual(ranked);
    });

    it("merges task due dates and open opportunity close dates, soonest first", async () => {
        const provider = await prisma.provider.create({ data: { name: "Mag", userId } });
        await createWritingTask({ userId, name: "Overdue task", dueDate: daysFromNow(-3).toISOString() });
        await createWritingTask({ userId, name: "Task due in 5", dueDate: daysFromNow(5).toISOString() });
        await createWritingTask({ userId, name: "Undated task" });
        await prisma.opportunity.createMany({
            data: [
                { userId, providerId: provider.id, title: "Contest in 3", closeDate: daysFromNow(3) },
                { userId, providerId: provider.id, title: "Closed contest", closeDate: daysFromNow(4), status: "closed" },
                { userId, providerId: provider.id, title: "Past contest", closeDate: daysFromNow(-10) },
                { userId: "dash-other", providerId: provider.id, title: "Other's contest", closeDate: daysFromNow(1) },
            ],
        });

        const result = await dashboard(userId);
        expect(result.upcomingDeadlines.map((d: Deadline) => [d.type, d.title])).toEqual([
            ["task", "Overdue task"],
            ["opportunity", "Contest in 3"],
            ["task", "Task due in 5"],
        ]);
    });

    it("narrows opportunity deadlines to those the project is a candidate for", async () => {
        const provider = await prisma.provider.create({ data: { name: "Mag", userId } });
        const contest = await prisma.opportunity.create({
            data: { userId, providerId: provider.id, title: "Novel contest", closeDate: daysFromNow(3) },
        });
        await prisma.opportunityCandidate.create({ data: { opportunityId: contest.id, projectId: novelId } });

        const titles = (result: { upcomingDeadlines: Deadline[] }) => result.upcomingDeadlines.map((d) => d.title);
        expect(titles(await dashboard(userId, { projectId: novelId }))).toEqual(["Novel contest"]);
        expect(titles(await dashboard(userId, { projectId: storyId }))).toEqual([]);
    });

    it("lists tasks completed in the last 7 days only", async () => {
        const recent = await createWritingTask({ userId, name: "Done yesterday" });
        const old = await createWritingTask({ userId, name: "Done last month" });
        await prisma.writingTask.update({ where: { id: recent.id }, data: { completed: true } });
        await prisma.writingTask.update({ where: { id: old.id }, data: { completed: true, updatedAt: daysFromNow(-30) } });

        const result = await dashboard(userId);
        expect(names(result.completedThisWeek)).toEqual(["Done yesterday"]);
        expect(result.openTaskTotal).toBe(0);
    });

    it("rejects a project the caller does not own", async () => {
        const result = await callTool("dash-other", "get_task_dashboard", { projectId: novelId });
        expect(result.isError).toBe(true);
    });
});
