import { describe, it, expect, beforeEach } from "vitest";
import { listWritingTasks, createWritingTask, updateWritingTask } from "@/mcp/tools/writing-tasks";
import { ProjectsController } from "@/lib/controllers/projects";
import { prisma } from "@/lib/db";

describe("MCP Writing Task Tools", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await ProjectsController.createProject({ title: "Test Project" });
        projectId = project.id;
    });

    describe("updateWritingTask", () => {
        it("updates specified fields and returns the task", async () => {
            const created = await createWritingTask({ projectId, userId: null, name: "Original", energy: "Dramatic" });

            const updated = await updateWritingTask({
                taskId: created.id,
                name: "Revised",
                importance: "High",
            });

            expect(updated.name).toBe("Revised");
            expect(updated.importance).toBe("High");
            expect(updated.energy).toBe("Dramatic"); // unchanged field preserved
        });

        it("can mark a task complete via completed flag", async () => {
            const created = await createWritingTask({ projectId, userId: null, name: "Draft" });
            expect(created.completed).toBe(false);

            const updated = await updateWritingTask({ taskId: created.id, completed: true });
            expect(updated.completed).toBe(true);
        });

        it("throws for a non-existent taskId", async () => {
            await expect(updateWritingTask({ taskId: "nonexistent", name: "x" }))
                .rejects.toThrow("Writing task not found");
        });

        it("throws when no optional fields are provided", async () => {
            const created = await createWritingTask({ projectId, userId: null, name: "Original" });
            await expect(updateWritingTask({ taskId: created.id }))
                .rejects.toThrow("No fields provided to update");
        });

        it("invalidates cache so subsequent listWritingTasks reflects the update", async () => {
            const created = await createWritingTask({ projectId, userId: null, name: "Before" });
            // Warm cache
            await listWritingTasks({ projectId, userId: null });

            await updateWritingTask({ taskId: created.id, name: "After" });

            // Cache should be invalidated; fresh fetch should reflect the new name
            const result = await listWritingTasks({ projectId, userId: null });
            expect(result.tasks.find((t: { id: string }) => t.id === created.id)?.name).toBe("After");
        });

        it("changes kind and capacity, and sets then clears dueDate", async () => {
            const created = await createWritingTask({ projectId, userId: null, name: "Task" });

            const dated = await updateWritingTask({ taskId: created.id, kind: "Revise", capacity: "Medium", dueDate: "2026-11-05" });
            expect(dated.kind).toBe("Revise");
            expect(dated.capacity).toBe("Medium");
            expect(dated.dueDate).toBe("2026-11-05T00:00:00.000Z");

            const cleared = await updateWritingTask({ taskId: created.id, dueDate: null });
            expect(cleared.dueDate).toBeNull();
            expect(cleared.kind).toBe("Revise");
        });
    });

    describe("createWritingTask", () => {
        it("defaults kind to Draft, capacity to Full and dueDate to null", async () => {
            const created = await createWritingTask({ projectId, userId: null, name: "Plain" });
            expect(created.kind).toBe("Draft");
            expect(created.capacity).toBe("Full");
            expect(created.dueDate).toBeNull();
        });

        it("round-trips kind, capacity and a date-only dueDate", async () => {
            const created = await createWritingTask({
                projectId, userId: null, name: "Read the brief", kind: "Read", capacity: "Low", dueDate: "2026-10-01",
            });
            expect(created.kind).toBe("Read");
            expect(created.capacity).toBe("Low");
            expect(created.dueDate).toBe("2026-10-01T00:00:00.000Z");
        });

        it("assigns a project task to the project's owner, not the caller", async () => {
            const owner = await prisma.user.create({
                data: { id: "wt-owner", email: "wt-owner@test.com", googleId: "google-wt-owner" },
            });
            const editor = await prisma.user.create({
                data: { id: "wt-editor", email: "wt-editor@test.com", googleId: "google-wt-editor" },
            });
            const owned = await ProjectsController.createProject({ title: "Owned", userId: owner.id });

            const created = await createWritingTask({ projectId: owned.id, userId: editor.id, name: "Shared" });

            const row = await prisma.writingTask.findUnique({ where: { id: created.id } });
            expect(row?.userId).toBe(owner.id);
        });

        it("rejects a sceneId without a projectId", async () => {
            await expect(createWritingTask({ userId: null, sceneId: "scene-1", name: "Orphan scene task" }))
                .rejects.toThrow("sceneId requires projectId");
        });
    });

    describe("practice tasks (no project)", () => {
        it("creates a task with projectId null owned by the caller", async () => {
            const user = await prisma.user.create({
                data: { id: "wt-user-a", email: "wt-a@test.com", googleId: "google-wt-a" },
            });
            const created = await createWritingTask({ userId: user.id, name: "Morning pages" });
            expect(created.projectId).toBeNull();

            const row = await prisma.writingTask.findUnique({ where: { id: created.id } });
            expect(row?.userId).toBe(user.id);
        });

        it("lists only the caller's project-less tasks when projectId is omitted", async () => {
            const a = await prisma.user.create({ data: { id: "wt-a", email: "a@test.com", googleId: "g-a" } });
            const b = await prisma.user.create({ data: { id: "wt-b", email: "b@test.com", googleId: "g-b" } });
            const aProject = await ProjectsController.createProject({ title: "A's novel", userId: a.id });

            const aPractice = await createWritingTask({ userId: a.id, name: "A practice" });
            await createWritingTask({ userId: b.id, name: "B practice" });
            await createWritingTask({ projectId: aProject.id, userId: a.id, name: "A project task" });

            const result = await listWritingTasks({ userId: a.id });
            expect(result.tasks.map((t: { id: string }) => t.id)).toEqual([aPractice.id]);
        });

        it("shows a newly created practice task after the list was cached", async () => {
            await createWritingTask({ userId: null, name: "First" });
            expect((await listWritingTasks({ userId: null })).total).toBe(1);

            await createWritingTask({ userId: null, name: "Second" });
            expect((await listWritingTasks({ userId: null })).total).toBe(2);
        });
    });

    describe("listWritingTasks filters", () => {
        it("filters by kind and capacity", async () => {
            await createWritingTask({ projectId, userId: null, name: "Admin low", kind: "Admin", capacity: "Low" });
            await createWritingTask({ projectId, userId: null, name: "Admin full", kind: "Admin", capacity: "Full" });
            await createWritingTask({ projectId, userId: null, name: "Draft low", kind: "Draft", capacity: "Low" });

            const admin = await listWritingTasks({ projectId, userId: null, kind: "Admin" });
            expect(admin.tasks.map((t: { name: string }) => t.name).sort()).toEqual(["Admin full", "Admin low"]);

            const adminLow = await listWritingTasks({ projectId, userId: null, kind: "Admin", capacity: "Low" });
            expect(adminLow.tasks.map((t: { name: string }) => t.name)).toEqual(["Admin low"]);
        });

        it("dueBefore keeps tasks due on or before the date and drops later and undated ones", async () => {
            await createWritingTask({ projectId, userId: null, name: "Early", dueDate: "2026-10-01" });
            await createWritingTask({ projectId, userId: null, name: "On the day", dueDate: "2026-10-10" });
            await createWritingTask({ projectId, userId: null, name: "Late", dueDate: "2026-12-01" });
            await createWritingTask({ projectId, userId: null, name: "Undated" });

            const result = await listWritingTasks({ projectId, userId: null, dueBefore: "2026-10-10" });
            expect(result.tasks.map((t: { name: string }) => t.name).sort()).toEqual(["Early", "On the day"]);
        });
    });
});
