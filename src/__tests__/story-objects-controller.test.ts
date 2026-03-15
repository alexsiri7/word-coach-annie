import { describe, it, expect, beforeEach } from "vitest";
import { StoryObjectController } from "@/lib/controllers/story-objects";
import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController } from "@/lib/controllers/structure";
import { testPrisma } from "./setup";

describe("StoryObjectController", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await ProjectsController.createProject({ title: "Test Project" });
        projectId = project.id;
    });

    describe("listStoryObjects", () => {
        it("lists objects for a project", async () => {
            await StoryObjectController.createStoryObject({ projectId, type: "CHARACTER", name: "Alice" });
            await StoryObjectController.createStoryObject({ projectId, type: "LOCATION", name: "Castle" });

            const result = await StoryObjectController.listStoryObjects({ projectId });
            expect(result.objects).toHaveLength(2);
            expect(result.total).toBe(2);
        });

        it("filters by type", async () => {
            await StoryObjectController.createStoryObject({ projectId, type: "CHARACTER", name: "Alice" });
            await StoryObjectController.createStoryObject({ projectId, type: "LOCATION", name: "Castle" });

            const result = await StoryObjectController.listStoryObjects({ projectId, type: "CHARACTER" });
            expect(result.objects).toHaveLength(1);
            expect(result.objects[0].name).toBe("Alice");
        });

        it("searches by name", async () => {
            await StoryObjectController.createStoryObject({ projectId, type: "CHARACTER", name: "Alice" });
            await StoryObjectController.createStoryObject({ projectId, type: "CHARACTER", name: "Bob" });

            const result = await StoryObjectController.listStoryObjects({ projectId, search: "Ali" });
            expect(result.objects).toHaveLength(1);
            expect(result.objects[0].name).toBe("Alice");
        });

        it("paginates results", async () => {
            for (let i = 0; i < 5; i++) {
                await StoryObjectController.createStoryObject({ projectId, type: "CHARACTER", name: `Char ${i}` });
            }

            const result = await StoryObjectController.listStoryObjects({ projectId, limit: 2, offset: 0 });
            expect(result.objects).toHaveLength(2);
            expect(result.total).toBe(5);
        });

        it("throws for invalid type", async () => {
            await expect(
                StoryObjectController.listStoryObjects({ projectId, type: "INVALID" })
            ).rejects.toThrow("Invalid type");
        });

        it("throws for non-existent project", async () => {
            await expect(
                StoryObjectController.listStoryObjects({ projectId: "nonexistent" })
            ).rejects.toThrow("Project not found");
        });
    });

    describe("getStoryObject", () => {
        it("gets object with relationships", async () => {
            const obj = await StoryObjectController.createStoryObject({
                projectId, type: "CHARACTER", name: "Alice", description: "Hero"
            });

            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "Scene 1" });

            await testPrisma.relationship.create({
                data: { type: "APPEARS_IN", fromObjectId: obj.id, toNodeId: scene.id }
            });

            const result = await StoryObjectController.getStoryObject(obj.id);
            expect(result.name).toBe("Alice");
            expect(result.description).toBe("Hero");
            expect(result.relationships).toHaveLength(1);
            expect(result.relationships[0].type).toBe("APPEARS_IN");
        });

        it("throws for non-existent object", async () => {
            await expect(
                StoryObjectController.getStoryObject("nonexistent")
            ).rejects.toThrow("Story object not found");
        });
    });

    describe("createStoryObject", () => {
        it("creates with all fields", async () => {
            const obj = await StoryObjectController.createStoryObject({
                projectId,
                type: "CHARACTER",
                name: "Alice",
                description: "The protagonist",
                notes: "Brave",
                role: "protagonist",
                tags: "main,hero"
            });

            expect(obj.name).toBe("Alice");
            expect(obj.type).toBe("CHARACTER");
            expect(obj.description).toBe("The protagonist");
            expect(obj.role).toBe("protagonist");
            expect(obj.tags).toBe("main,hero");
        });

        it("trims name", async () => {
            const obj = await StoryObjectController.createStoryObject({
                projectId, type: "CHARACTER", name: "  Alice  "
            });
            expect(obj.name).toBe("Alice");
        });

        it("throws for empty name", async () => {
            await expect(
                StoryObjectController.createStoryObject({ projectId, type: "CHARACTER", name: "" })
            ).rejects.toThrow("name is required");
        });

        it("throws for invalid type", async () => {
            await expect(
                StoryObjectController.createStoryObject({ projectId, type: "INVALID", name: "X" })
            ).rejects.toThrow("Invalid type");
        });

        it("throws for non-existent project", async () => {
            await expect(
                StoryObjectController.createStoryObject({ projectId: "bad", type: "CHARACTER", name: "X" })
            ).rejects.toThrow("Project not found");
        });
    });

    describe("updateStoryObject", () => {
        it("updates fields", async () => {
            const obj = await StoryObjectController.createStoryObject({
                projectId, type: "CHARACTER", name: "Alice"
            });

            const updated = await StoryObjectController.updateStoryObject(obj.id, {
                name: "Alice Smith",
                description: "Updated desc",
                tags: "hero"
            });

            expect(updated.name).toBe("Alice Smith");
            expect(updated.description).toBe("Updated desc");
            expect(updated.tags).toBe("hero");
        });

        it("throws for empty name", async () => {
            const obj = await StoryObjectController.createStoryObject({
                projectId, type: "CHARACTER", name: "Alice"
            });
            await expect(
                StoryObjectController.updateStoryObject(obj.id, { name: "  " })
            ).rejects.toThrow("name must be a non-empty string");
        });

        it("throws for no fields", async () => {
            const obj = await StoryObjectController.createStoryObject({
                projectId, type: "CHARACTER", name: "Alice"
            });
            await expect(
                StoryObjectController.updateStoryObject(obj.id, {})
            ).rejects.toThrow("No fields to update");
        });

        it("throws for non-existent object", async () => {
            await expect(
                StoryObjectController.updateStoryObject("bad", { name: "X" })
            ).rejects.toThrow("Story object not found");
        });
    });

    describe("deleteStoryObject", () => {
        it("deletes and returns info", async () => {
            const obj = await StoryObjectController.createStoryObject({
                projectId, type: "CHARACTER", name: "Alice"
            });

            const result = await StoryObjectController.deleteStoryObject(obj.id);
            expect(result.deleted).toBe(true);
            expect(result.name).toBe("Alice");

            await expect(
                StoryObjectController.getStoryObject(obj.id)
            ).rejects.toThrow("Story object not found");
        });

        it("throws for non-existent object", async () => {
            await expect(
                StoryObjectController.deleteStoryObject("bad")
            ).rejects.toThrow("Story object not found");
        });
    });
});
