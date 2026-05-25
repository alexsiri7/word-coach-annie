import { describe, it, expect, beforeEach } from "vitest";
import { listWritingTasks, createWritingTask, updateWritingTask } from "@/mcp/tools/writing-tasks";
import { ProjectsController } from "@/lib/controllers/projects";

describe("MCP Writing Task Tools", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await ProjectsController.createProject({ title: "Test Project" });
        projectId = project.id;
    });

    describe("updateWritingTask", () => {
        it("updates specified fields and returns the task", async () => {
            const created = await createWritingTask({ projectId, name: "Original", energy: "Dramatic" });

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
            const created = await createWritingTask({ projectId, name: "Draft" });
            expect(created.completed).toBe(false);

            const updated = await updateWritingTask({ taskId: created.id, completed: true });
            expect(updated.completed).toBe(true);
        });

        it("throws for a non-existent taskId", async () => {
            await expect(updateWritingTask({ taskId: "nonexistent", name: "x" }))
                .rejects.toThrow("Writing task not found");
        });

        it("throws when no optional fields are provided", async () => {
            const created = await createWritingTask({ projectId, name: "Original" });
            await expect(updateWritingTask({ taskId: created.id }))
                .rejects.toThrow("No fields provided to update");
        });

        it("invalidates cache so subsequent listWritingTasks reflects the update", async () => {
            const created = await createWritingTask({ projectId, name: "Before" });
            // Warm cache
            await listWritingTasks({ projectId });

            await updateWritingTask({ taskId: created.id, name: "After" });

            // Cache should be invalidated; fresh fetch should reflect the new name
            const result = await listWritingTasks({ projectId });
            expect(result.tasks.find((t: { id: string }) => t.id === created.id)?.name).toBe("After");
        });
    });
});
