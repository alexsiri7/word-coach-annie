import { describe, it, expect, beforeEach } from "vitest";
import { FocusController } from "@/lib/controllers/focus";
import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController } from "@/lib/controllers/structure";
import { UniversesController } from "@/lib/controllers/universes";
import { testPrisma } from "./setup";

describe("FocusController", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await ProjectsController.createProject({ title: "Test Novel" });
        projectId = project.id;
    });

    describe("getSceneContext", () => {
        it("returns scene context with navigation", { timeout: 15000 }, async () => {
            const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Chapter 1" });
            const s1 = await StructureController.createNode({ projectId, type: "SCENE", title: "Scene 1", parentId: ch.id });
            const s2 = await StructureController.createNode({ projectId, type: "SCENE", title: "Scene 2", parentId: ch.id });
            const _s3 = await StructureController.createNode({ projectId, type: "SCENE", title: "Scene 3", parentId: ch.id });

            // Write content to scene 2
            await StructureController.writeSceneContent(s2.id, "Hello world foo bar");

            const ctx = await FocusController.getSceneContext(s2.id);
            expect(ctx.title).toBe("Scene 2");
            expect(ctx.projectTitle).toBe("Test Novel");
            expect(ctx.chapterTitle).toBe("Chapter 1");
            expect(ctx.wordCount).toBe(4);
            expect(ctx.prevScene).toEqual({ id: s1.id, title: "Scene 1" });
            expect(ctx.nextScene).toEqual({ id: _s3.id, title: "Scene 3" });
        });

        it("returns null for prevScene on first scene", async () => {
            const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Chapter 1" });
            const s1 = await StructureController.createNode({ projectId, type: "SCENE", title: "Scene 1", parentId: ch.id });

            const ctx = await FocusController.getSceneContext(s1.id);
            expect(ctx.prevScene).toBeNull();
            expect(ctx.nextScene).toBeNull();
        });

        it("returns null chapterTitle for root-level scene", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "Standalone" });

            const ctx = await FocusController.getSceneContext(scene.id);
            expect(ctx.chapterTitle).toBeNull();
        });

        it("returns 0 wordCount when no content", async () => {
            const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "Empty", parentId: ch.id });

            const ctx = await FocusController.getSceneContext(scene.id);
            expect(ctx.wordCount).toBe(0);
        });

        it("throws for non-existent scene", async () => {
            await expect(
                FocusController.getSceneContext("nonexistent")
            ).rejects.toThrow("Scene not found");
        });
    });

    describe("getRelatedElements", () => {
        it("returns related story objects grouped by type", async () => {
            const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "Scene 1", parentId: ch.id });

            const char = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "Alice", description: "Hero", role: "protagonist" }
            });
            const loc = await testPrisma.storyObject.create({
                data: { projectId, type: "LOCATION", name: "Castle" }
            });

            await testPrisma.relationship.create({
                data: { type: "APPEARS_IN", fromObjectId: char.id, toNodeId: scene.id }
            });
            await testPrisma.relationship.create({
                data: { type: "LOCATED_AT", fromObjectId: loc.id, toNodeId: scene.id }
            });

            const grouped = await FocusController.getRelatedElements(scene.id);
            expect(grouped.CHARACTER).toHaveLength(1);
            expect(grouped.CHARACTER[0].name).toBe("Alice");
            expect(grouped.LOCATION).toHaveLength(1);
            expect(grouped.LOCATION[0].name).toBe("Castle");
            expect(grouped.PLOTLINE).toHaveLength(0);
        });

        it("returns empty groups for no relationships", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "Scene 1" });

            const grouped = await FocusController.getRelatedElements(scene.id);
            expect(grouped.CHARACTER).toHaveLength(0);
            expect(grouped.LOCATION).toHaveLength(0);
        });

        it("includes world objects from linked universe", async () => {
            const universe = await UniversesController.createUniverse({ title: "Test Universe" });
            await UniversesController.linkProjectToUniverse(projectId, universe.id);

            const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "Scene 1", parentId: ch.id });

            const worldChar = await UniversesController.createWorldObject({
                universeId: universe.id,
                type: "CHARACTER",
                name: "Universe Hero",
            });

            const storyChar = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "Project Hero" }
            });

            // Relationship from world object to scene
            await testPrisma.relationship.create({
                data: { type: "APPEARS_IN", fromWorldObjectId: worldChar.id, toNodeId: scene.id }
            });
            // Relationship from story object to scene
            await testPrisma.relationship.create({
                data: { type: "APPEARS_IN", fromObjectId: storyChar.id, toNodeId: scene.id }
            });

            const grouped = await FocusController.getRelatedElements(scene.id);
            expect(grouped.CHARACTER).toHaveLength(2);
            const names = grouped.CHARACTER.map(c => c.name).sort();
            expect(names).toEqual(["Project Hero", "Universe Hero"]);

            const universeChar = grouped.CHARACTER.find(c => c.name === "Universe Hero");
            expect(universeChar?.source).toBe("universe");
            const projectChar = grouped.CHARACTER.find(c => c.name === "Project Hero");
            expect(projectChar?.source).toBe("project");
        });

        it("deduplicates objects with multiple relationships to same scene", async () => {
            const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "Scene 1", parentId: ch.id });

            const char = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "Alice" }
            });

            // Two relationships from same object to same scene
            await testPrisma.relationship.create({
                data: { type: "APPEARS_IN", fromObjectId: char.id, toNodeId: scene.id }
            });
            await testPrisma.relationship.create({
                data: { type: "RELATED_TO", toObjectId: char.id, fromNodeId: scene.id }
            });

            const grouped = await FocusController.getRelatedElements(scene.id);
            expect(grouped.CHARACTER).toHaveLength(1);
        });
    });

    describe("getAnnotations", () => {
        it("returns annotations for a scene ordered by newest first", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "Scene 1" });

            await testPrisma.annotation.create({
                data: { nodeId: scene.id, content: "First note", range: "0:5" }
            });
            await testPrisma.annotation.create({
                data: { nodeId: scene.id, content: "Second note", range: "10:15", resolved: true }
            });

            const annotations = await FocusController.getAnnotations(scene.id);
            expect(annotations).toHaveLength(2);
            expect(annotations[0].content).toBe("Second note");
            expect(annotations[0].resolved).toBe(true);
            expect(annotations[1].content).toBe("First note");
        });

        it("returns empty array for scene with no annotations", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "Scene 1" });

            const annotations = await FocusController.getAnnotations(scene.id);
            expect(annotations).toHaveLength(0);
        });
    });
});
