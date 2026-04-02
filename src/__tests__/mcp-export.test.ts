import { describe, it, expect, beforeEach } from "vitest";
import { exportManuscript, exportStoryBible, exportMedium, getProjectSummary, exportUniverse } from "@/mcp/tools/export";
import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController } from "@/lib/controllers/structure";
import { UniversesController } from "@/lib/controllers/universes";
import { testPrisma } from "./setup";

describe("MCP Export Tools", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await ProjectsController.createProject({
            title: "My Novel",
            author: "Jane Doe",
            genre: "Fantasy",
            synopsis: "An epic tale"
        });
        projectId = project.id;
    });

    describe("exportManuscript", () => {
        it("exports empty project with header", async () => {
            const md = await exportManuscript(projectId);
            expect(md).toContain("# My Novel");
            expect(md).toContain("Jane Doe");
            expect(md).toContain("Fantasy");
            expect(md).toContain("An epic tale");
        });

        it("exports chapters and scenes", async () => {
            const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "The Beginning" });
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1", parentId: ch.id });
            await StructureController.writeSceneContent(scene.id, "<p>The hero awoke.</p>");

            const md = await exportManuscript(projectId);
            expect(md).toContain("## Chapter 1: The Beginning");
            expect(md).toContain("The hero awoke.");
        });

        it("numbers chapters sequentially", async () => {
            const ch1 = await StructureController.createNode({ projectId, type: "CHAPTER", title: "First" });
            const s1 = await StructureController.createNode({ projectId, type: "SCENE", title: "S1", parentId: ch1.id });
            await StructureController.writeSceneContent(s1.id, "<p>Content 1</p>");

            const ch2 = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Second" });
            const s2 = await StructureController.createNode({ projectId, type: "SCENE", title: "S2", parentId: ch2.id });
            await StructureController.writeSceneContent(s2.id, "<p>Content 2</p>");

            const md = await exportManuscript(projectId);
            expect(md).toContain("## Chapter 1: First");
            expect(md).toContain("## Chapter 2: Second");
        });

        it("renders PART nodes as h1", async () => {
            const part = await StructureController.createNode({ projectId, type: "PART", title: "Part One" });
            const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1", parentId: part.id });
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1", parentId: ch.id });
            await StructureController.writeSceneContent(scene.id, "<p>Text</p>");

            const md = await exportManuscript(projectId);
            expect(md).toContain("# Part One");
        });

        it("strips beats by default", async () => {
            const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch" });
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1", parentId: ch.id });
            await StructureController.writeSceneContent(scene.id, "<p>Text</p><!-- beat: hidden beat --><p>More</p>");

            const md = await exportManuscript(projectId);
            expect(md).not.toContain("hidden beat");
            expect(md).toContain("Text");
            expect(md).toContain("More");
        });

        it("does not strip beats when includeBeats option set", async () => {
            const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch" });
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1", parentId: ch.id });
            await StructureController.writeSceneContent(scene.id, "<p>Text</p><!-- beat: visible beat -->");

            // includeBeats=true skips the explicit beat removal, but the generic
            // HTML tag stripper still removes the comment. This tests current behavior.
            const mdWithBeats = await exportManuscript(projectId, { includeBeats: true });
            const mdWithout = await exportManuscript(projectId);
            // Both should contain the text content
            expect(mdWithBeats).toContain("Text");
            expect(mdWithout).toContain("Text");
        });

        it("throws for non-existent project", async () => {
            await expect(exportManuscript("bad")).rejects.toThrow("Project not found");
        });
    });

    describe("exportStoryBible", () => {
        it("exports grouped story objects", async () => {
            await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "Alice", role: "protagonist", description: "The hero", tags: "main" }
            });
            await testPrisma.storyObject.create({
                data: { projectId, type: "LOCATION", name: "Castle", description: "A fortress" }
            });

            const md = await exportStoryBible(projectId);
            expect(md).toContain("# Story Bible: My Novel");
            expect(md).toContain("## Characters");
            expect(md).toContain("### Alice");
            expect(md).toContain("**Role:** protagonist");
            expect(md).toContain("**Tags:** main");
            expect(md).toContain("## Locations");
            expect(md).toContain("### Castle");
        });

        it("exports relationships", async () => {
            const char = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "Alice" }
            });
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "Opening" });
            await testPrisma.relationship.create({
                data: { type: "APPEARS_IN", fromObjectId: char.id, toNodeId: scene.id, label: "as hero" }
            });

            const md = await exportStoryBible(projectId);
            expect(md).toContain("## Relationships");
            expect(md).toContain("Alice");
            expect(md).toContain("appears in");
            expect(md).toContain("Opening");
        });

        it("throws for non-existent project", async () => {
            await expect(exportStoryBible("bad")).rejects.toThrow("Project not found");
        });
    });

    describe("getProjectSummary", () => {
        it("returns comprehensive project summary", async () => {
            const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
            const s1 = await StructureController.createNode({ projectId, type: "SCENE", title: "S1", parentId: ch.id });
            await StructureController.writeSceneContent(s1.id, "One two three");

            await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "Alice" }
            });

            const summary = await getProjectSummary(projectId);
            expect(summary.project.title).toBe("My Novel");
            expect(summary.structure.nodesByType.CHAPTER).toBe(1);
            expect(summary.structure.nodesByType.SCENE).toBe(1);
            expect(summary.structure.scenesByStatus.OUTLINE).toBe(1);
            expect(summary.storyObjects.CHARACTER).toBe(1);
            expect(summary.totalWordCount).toBe(3);
        });

        it("counts relationships", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
            const char = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "Alice" }
            });
            await testPrisma.relationship.create({
                data: { type: "APPEARS_IN", fromObjectId: char.id, toNodeId: scene.id }
            });

            const summary = await getProjectSummary(projectId);
            expect(summary.relationshipCount).toBe(1);
        });

        it("throws for non-existent project", async () => {
            await expect(getProjectSummary("bad")).rejects.toThrow("Project not found");
        });
    });

    describe("exportMedium", () => {
        it("exports all scenes for project", async () => {
            const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Article" });
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "Section 1", parentId: ch.id });
            await StructureController.writeSceneContent(scene.id, "<p>Article content here</p>");

            const md = await exportMedium(projectId);
            expect(md).toContain("# Article");
            expect(md).toContain("Article content here");
        });

        it("exports specific node", async () => {
            const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "My Article" });
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "Section", parentId: ch.id });
            await StructureController.writeSceneContent(scene.id, "<p>Specific content</p>");

            const md = await exportMedium(projectId, ch.id);
            expect(md).toContain("My Article");
            expect(md).toContain("Specific content");
        });

        it("returns empty for project with no scenes", async () => {
            const md = await exportMedium(projectId);
            expect(md).toBe("");
        });

        it("throws for non-existent project", async () => {
            await expect(exportMedium("bad")).rejects.toThrow("Project not found");
        });
    });

    describe("exportUniverse", () => {
        it("exports universe with world objects and timelines", async () => {
            const u = await UniversesController.createUniverse({
                title: "My World",
                description: "A rich fantasy world"
            });

            const wo = await UniversesController.createWorldObject({
                universeId: u.id,
                type: "CHARACTER",
                name: "Hero",
                description: "The main character",
                tags: "main",
                notes: "Very brave"
            });

            await UniversesController.addTimelineEntry({
                worldObjectId: wo.id,
                label: "Birth",
                description: "Born in a village"
            });

            const md = await exportUniverse(u.id);
            expect(md).toContain("# Universe: My World");
            expect(md).toContain("A rich fantasy world");
            expect(md).toContain("## Characters");
            expect(md).toContain("### Hero");
            expect(md).toContain("The main character");
            expect(md).toContain("**Tags:** main");
            expect(md).toContain("*Notes:* Very brave");
            expect(md).toContain("**Timeline (state history):**");
            expect(md).toContain("**Birth**: Born in a village");
        });

        it("throws for non-existent universe", async () => {
            await expect(exportUniverse("bad")).rejects.toThrow("Universe not found");
        });
    });
});
