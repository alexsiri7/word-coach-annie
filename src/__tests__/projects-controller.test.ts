import { describe, it, expect } from "vitest";
import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController } from "@/lib/controllers/structure";

describe("ProjectsController", () => {
    describe("createProject", () => {
        it("creates a project with all fields", async () => {
            const p = await ProjectsController.createProject({
                title: "My Novel",
                author: "Author",
                synopsis: "A great story",
                genre: "Fantasy"
            });

            expect(p.title).toBe("My Novel");
            expect(p.author).toBe("Author");
            expect(p.synopsis).toBe("A great story");
            expect(p.genre).toBe("Fantasy");
            expect(p.id).toBeDefined();
            expect(p.createdAt).toBeDefined();
        });

        it("trims title", async () => {
            const p = await ProjectsController.createProject({ title: "  Padded  " });
            expect(p.title).toBe("Padded");
        });

        it("throws for empty title", async () => {
            await expect(
                ProjectsController.createProject({ title: "" })
            ).rejects.toThrow("Title is required");
        });

        it("throws for whitespace-only title", async () => {
            await expect(
                ProjectsController.createProject({ title: "   " })
            ).rejects.toThrow("Title is required");
        });
    });

    describe("getProject", () => {
        it("returns project with counts", async () => {
            const p = await ProjectsController.createProject({ title: "Novel" });
            await StructureController.createNode({ projectId: p.id, type: "CHAPTER", title: "Ch 1" });

            const result = await ProjectsController.getProject(p.id);
            expect(result.title).toBe("Novel");
            expect(result.nodeCount).toBe(1);
            expect(result.storyObjectCount).toBe(0);
            expect(result.wordCount).toBe(0);
        });

        it("returns correct word count from scene content", async () => {
            const p = await ProjectsController.createProject({ title: "Novel" });
            const ch = await StructureController.createNode({ projectId: p.id, type: "CHAPTER", title: "Ch 1" });
            const scene = await StructureController.createNode({
                projectId: p.id, type: "SCENE", title: "S1", parentId: ch.id
            });
            await StructureController.writeSceneContent(scene.id, "One two three");

            const result = await ProjectsController.getProject(p.id);
            expect(result.wordCount).toBe(3);
        });

        it("throws for non-existent project", async () => {
            await expect(
                ProjectsController.getProject("nonexistent")
            ).rejects.toThrow("Project not found");
        });
    });

    describe("listProjects", () => {
        it("lists projects with word counts", async () => {
            const p = await ProjectsController.createProject({ title: "Novel" });
            const ch = await StructureController.createNode({ projectId: p.id, type: "CHAPTER", title: "Ch 1" });
            const scene = await StructureController.createNode({
                projectId: p.id, type: "SCENE", title: "S1", parentId: ch.id
            });
            await StructureController.writeSceneContent(scene.id, "One two three");

            const result = await ProjectsController.listProjects();
            const found = result.projects.find(proj => proj.id === p.id);
            expect(found).toBeDefined();
            expect(found!.wordCount).toBe(3);
            expect(found!.nodeCount).toBe(2); // chapter + scene
        });

        it("paginates results", async () => {
            for (let i = 0; i < 5; i++) {
                await ProjectsController.createProject({ title: `Project ${i}` });
            }

            const result = await ProjectsController.listProjects(2, 0);
            expect(result.projects).toHaveLength(2);
            expect(result.total).toBe(5);
        });
    });

    describe("updateProject", () => {
        it("updates project fields", async () => {
            const p = await ProjectsController.createProject({ title: "Original" });
            const updated = await ProjectsController.updateProject(p.id, {
                title: "Updated",
                genre: "Horror"
            });

            expect(updated.title).toBe("Updated");
            expect(updated.genre).toBe("Horror");
        });

        it("throws for non-existent project", async () => {
            await expect(
                ProjectsController.updateProject("bad", { title: "X" })
            ).rejects.toThrow("Project not found");
        });

        it("throws for no fields", async () => {
            const p = await ProjectsController.createProject({ title: "Test" });
            await expect(
                ProjectsController.updateProject(p.id, {})
            ).rejects.toThrow("No fields to update");
        });
    });
});
