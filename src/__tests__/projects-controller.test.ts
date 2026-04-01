import { describe, it, expect } from "vitest";
import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController } from "@/lib/controllers/structure";
import { testPrisma } from "./setup";

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

    describe("project limit for free users", () => {
        async function createTestUser(overrides: { subscriptionTier?: string; maxProjects?: number } = {}) {
            return testPrisma.user.create({
                data: {
                    email: `test-${Date.now()}@example.com`,
                    googleId: `google-${Date.now()}`,
                    name: "Test User",
                    ...overrides,
                },
            });
        }

        it("allows creating projects up to the limit", async () => {
            const user = await createTestUser({ maxProjects: 2 });

            const p1 = await ProjectsController.createProject({ title: "Project 1", userId: user.id });
            expect(p1.id).toBeDefined();

            const p2 = await ProjectsController.createProject({ title: "Project 2", userId: user.id });
            expect(p2.id).toBeDefined();
        });

        it("rejects project creation when limit is reached", async () => {
            const user = await createTestUser({ maxProjects: 2 });

            await ProjectsController.createProject({ title: "Project 1", userId: user.id });
            await ProjectsController.createProject({ title: "Project 2", userId: user.id });

            await expect(
                ProjectsController.createProject({ title: "Project 3", userId: user.id })
            ).rejects.toThrow("Project limit reached (2/2)");
        });

        it("does not count archived projects toward limit", async () => {
            const user = await createTestUser({ maxProjects: 2 });

            const p1 = await ProjectsController.createProject({ title: "Project 1", userId: user.id });
            await ProjectsController.createProject({ title: "Project 2", userId: user.id });

            // Archive one project
            await testPrisma.project.update({
                where: { id: p1.id },
                data: { archivedAt: new Date() },
            });

            // Should now be allowed since only 1 active project
            const p3 = await ProjectsController.createProject({ title: "Project 3", userId: user.id });
            expect(p3.id).toBeDefined();
        });

        it("does not enforce limit when no userId is provided", async () => {
            // Dev/API_TOKEN mode — no user scoping
            for (let i = 0; i < 5; i++) {
                const p = await ProjectsController.createProject({ title: `Project ${i}` });
                expect(p.id).toBeDefined();
            }
        });

        it("uses default FREE limit (3) for new users", async () => {
            const user = await createTestUser();

            const { allowed, limit } = await ProjectsController.checkProjectLimit(user.id);
            expect(allowed).toBe(true);
            expect(limit).toBe(3);
        });

        it("PRO users have no project limit", async () => {
            const user = await createTestUser({ subscriptionTier: "PRO", maxProjects: 999999 });

            for (let i = 0; i < 5; i++) {
                await ProjectsController.createProject({ title: `Project ${i}`, userId: user.id });
            }

            const { allowed } = await ProjectsController.checkProjectLimit(user.id);
            expect(allowed).toBe(true);
        });

        it("checkProjectLimit returns correct counts", async () => {
            const user = await createTestUser({ maxProjects: 3 });

            await ProjectsController.createProject({ title: "P1", userId: user.id });
            await ProjectsController.createProject({ title: "P2", userId: user.id });

            const result = await ProjectsController.checkProjectLimit(user.id);
            expect(result).toEqual({ allowed: true, current: 2, limit: 3 });
        });

        it("per-user maxProjects overrides tier default", async () => {
            const user = await createTestUser({ subscriptionTier: "FREE", maxProjects: 5 });

            for (let i = 0; i < 5; i++) {
                await ProjectsController.createProject({ title: `P${i}`, userId: user.id });
            }

            const { allowed, current, limit } = await ProjectsController.checkProjectLimit(user.id);
            expect(allowed).toBe(false);
            expect(current).toBe(5);
            expect(limit).toBe(5);
        });
    });
});
