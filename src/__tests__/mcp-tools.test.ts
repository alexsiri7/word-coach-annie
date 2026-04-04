import { describe, it, expect, beforeEach } from "vitest";
import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController } from "@/lib/controllers/structure";
import * as structureTools from "@/mcp/tools/structure";
import * as projectTools from "@/mcp/tools/projects";
import * as storyObjectTools from "@/mcp/tools/story-objects";
import * as universeTools from "@/mcp/tools/universes";

describe("MCP Structure Tools", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await ProjectsController.createProject({ title: "Test Project" });
        projectId = project.id;
    });

    it("getOutline delegates to StructureController", async () => {
        await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
        const outline = await structureTools.getOutline(projectId);
        expect(outline).toHaveLength(1);
        expect(outline[0].title).toBe("Ch 1");
    });

    it("createNode delegates to StructureController", async () => {
        const node = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        expect(node.title).toBe("S1");
        expect(node.type).toBe("SCENE");
    });

    it("updateNode delegates to StructureController", async () => {
        const node = await structureTools.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
        const updated = await structureTools.updateNode(node.id, { title: "Updated" });
        expect(updated.title).toBe("Updated");
    });

    it("deleteNode delegates to StructureController", async () => {
        const node = await structureTools.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
        const result = await structureTools.deleteNode(node.id);
        expect(result.deleted).toBe(true);
    });

    it("readSceneContent delegates to StructureController", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        const content = await structureTools.readSceneContent(scene.id);
        expect(content.nodeId).toBe(scene.id);
        expect(content.content).toBe("");
    });

    it("writeSceneContent delegates to StructureController", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        const result = await structureTools.writeSceneContent(scene.id, "Hello world");
        expect(result.wordCount).toBe(2);
    });

    it("writeSceneContentFromBlocks delegates to StructureController", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        const result = await structureTools.writeSceneContentFromBlocks(scene.id, [
            { type: "CONTENT", content: "<p>Hello world</p>" },
            { type: "BEAT", content: "Action beat" },
            { type: "CONTENT", content: "<p>More text</p>" }
        ]);
        expect(result.wordCount).toBeGreaterThan(0);
    });

    it("getSceneVersions delegates to StructureController", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        await structureTools.writeSceneContent(scene.id, "Version 1");
        await structureTools.writeSceneContent(scene.id, "Version 2");
        const versions = await structureTools.getSceneVersions(scene.id);
        expect(versions.versions.length).toBeGreaterThanOrEqual(2);
    });

    it("restoreSceneVersion delegates to StructureController", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        await structureTools.writeSceneContent(scene.id, "Original");
        const versions = await structureTools.getSceneVersions(scene.id);
        const firstVersion = versions.versions[versions.versions.length - 1];
        await structureTools.writeSceneContent(scene.id, "Changed");
        const result = await structureTools.restoreSceneVersion(scene.id, firstVersion.id);
        expect(result.restoredFromVersionId).toBe(firstVersion.id);
    });

    it("addAnnotation delegates to StructureController", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        const annotation = await structureTools.addAnnotation(scene.id, "Fix this");
        expect(annotation.content).toBe("Fix this");
    });

    it("updateAnnotation delegates to StructureController", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        const ann = await structureTools.addAnnotation(scene.id, "Original");
        const updated = await structureTools.updateAnnotation(ann.id, { content: "Updated" });
        expect(updated.content).toBe("Updated");
    });

    it("deleteAnnotation delegates to StructureController", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        const ann = await structureTools.addAnnotation(scene.id, "To delete");
        await structureTools.deleteAnnotation(ann.id);
        const content = await structureTools.readSceneContent(scene.id);
        expect(content.annotations).toHaveLength(0);
    });

    it("resolveAnnotation delegates to StructureController", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        const ann = await structureTools.addAnnotation(scene.id, "To resolve");
        const resolved = await structureTools.resolveAnnotation(ann.id, true);
        expect(resolved.resolved).toBe(true);
    });

    it("getOpenAnnotations delegates to StructureController", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        await structureTools.addAnnotation(scene.id, "Open one");
        const open = await structureTools.getOpenAnnotations(projectId);
        expect(open).toHaveLength(1);
        expect(open[0].content).toBe("Open one");
    });

    it("getParagraph returns paragraph node at orderIndex", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        await structureTools.writeSceneContent(scene.id, "<p>Hello</p><!-- beat: Action --><p>World</p>");
        const para = await structureTools.getParagraph(scene.id, 0);
        expect(para.type).toBe("paragraph");
        expect(para.content).toBe("<p>Hello</p>");
    });

    it("updateParagraph updates content and creates new version", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        await structureTools.writeSceneContent(scene.id, "<p>Original</p>");
        const result = await structureTools.updateParagraph(scene.id, 0, "<p>Updated</p>");
        expect(result.content).toBe("<p>Updated</p>");
        expect(result.versionId).toBeTruthy();
        const content = await structureTools.readSceneContent(scene.id);
        expect(content.content).toBe("<p>Updated</p>");
    });

    it("insertParagraph inserts after given orderIndex", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        await structureTools.writeSceneContent(scene.id, "<p>First</p><p>Second</p>");
        const result = await structureTools.insertParagraph(scene.id, 0, "<p>Middle</p>");
        expect(result.orderIndex).toBe(1);
        const content = await structureTools.readSceneContent(scene.id);
        expect(content.nodes).toHaveLength(3);
        expect(content.nodes[1].content).toBe("<p>Middle</p>");
    });

    it("insertParagraph with afterOrderIndex=-1 inserts at beginning", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        await structureTools.writeSceneContent(scene.id, "<p>Existing</p>");
        await structureTools.insertParagraph(scene.id, -1, "<p>New first</p>");
        const content = await structureTools.readSceneContent(scene.id);
        expect(content.nodes[0].content).toBe("<p>New first</p>");
    });

    it("deleteParagraph removes node and renumbers", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        await structureTools.writeSceneContent(scene.id, "<p>A</p><p>B</p><p>C</p>");
        await structureTools.deleteParagraph(scene.id, 1);
        const content = await structureTools.readSceneContent(scene.id);
        expect(content.nodes).toHaveLength(2);
        expect(content.nodes[0].content).toBe("<p>A</p>");
        expect(content.nodes[0].orderIndex).toBe(0);
        expect(content.nodes[1].content).toBe("<p>C</p>");
        expect(content.nodes[1].orderIndex).toBe(1);
    });

    it("getBeat returns beat node at orderIndex", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        await structureTools.writeSceneContent(scene.id, "<p>Prose</p><!-- beat: Initial beat -->");
        const beat = await structureTools.getBeat(scene.id, 1);
        expect(beat.type).toBe("beat");
        expect(beat.content).toBe("Initial beat");
    });

    it("updateBeat updates beat content and creates new version", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        await structureTools.writeSceneContent(scene.id, "<!-- beat: Old beat -->");
        const result = await structureTools.updateBeat(scene.id, 0, "New beat");
        expect(result.content).toBe("New beat");
        const content = await structureTools.readSceneContent(scene.id);
        expect(content.nodes[0].content).toBe("New beat");
    });

    it("getParagraph throws when node is a beat", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        await structureTools.writeSceneContent(scene.id, "<!-- beat: A beat -->");
        await expect(structureTools.getParagraph(scene.id, 0)).rejects.toThrow("type 'beat', not 'paragraph'");
    });

    it("getBeat throws when node is a paragraph", async () => {
        const scene = await structureTools.createNode({ projectId, type: "SCENE", title: "S1" });
        await structureTools.writeSceneContent(scene.id, "<p>Some text</p>");
        await expect(structureTools.getBeat(scene.id, 0)).rejects.toThrow("type 'paragraph', not 'beat'");
    });
});

describe("MCP Project Tools", () => {
    it("listProjects delegates to ProjectsController", async () => {
        await ProjectsController.createProject({ title: "P1" });
        const result = await projectTools.listProjects();
        expect(result.projects.length).toBeGreaterThanOrEqual(1);
    });

    it("getProject delegates to ProjectsController", async () => {
        const p = await ProjectsController.createProject({ title: "P1" });
        const result = await projectTools.getProject(p.id);
        expect(result.title).toBe("P1");
    });

    it("createProject delegates to ProjectsController", async () => {
        const p = await projectTools.createProject({ title: "New Project" });
        expect(p.title).toBe("New Project");
    });

    it("updateProject delegates to ProjectsController", async () => {
        const p = await projectTools.createProject({ title: "Original" });
        const updated = await projectTools.updateProject(p.id, { title: "Updated" });
        expect(updated.title).toBe("Updated");
    });
});

describe("MCP Story Object Tools", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await ProjectsController.createProject({ title: "Test" });
        projectId = project.id;
    });

    it("listStoryObjects delegates to StoryObjectController", async () => {
        await storyObjectTools.createStoryObject({ projectId, type: "CHARACTER", name: "Alice" });
        const result = await storyObjectTools.listStoryObjects({ projectId });
        expect(result.objects).toHaveLength(1);
    });

    it("getStoryObject delegates to StoryObjectController", async () => {
        const obj = await storyObjectTools.createStoryObject({ projectId, type: "CHARACTER", name: "Alice" });
        const result = await storyObjectTools.getStoryObject(obj.id);
        expect(result.name).toBe("Alice");
    });

    it("updateStoryObject delegates to StoryObjectController", async () => {
        const obj = await storyObjectTools.createStoryObject({ projectId, type: "CHARACTER", name: "Alice" });
        const updated = await storyObjectTools.updateStoryObject(obj.id, { name: "Bob" });
        expect(updated.name).toBe("Bob");
    });

    it("deleteStoryObject delegates to StoryObjectController", async () => {
        const obj = await storyObjectTools.createStoryObject({ projectId, type: "CHARACTER", name: "Alice" });
        const result = await storyObjectTools.deleteStoryObject(obj.id);
        expect(result.deleted).toBe(true);
    });
});

describe("MCP Universe Tools", () => {
    it("listUniverses delegates to UniversesController", async () => {
        await universeTools.createUniverse({ title: "U1" });
        const result = await universeTools.listUniverses();
        expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it("getUniverse delegates to UniversesController", async () => {
        const u = await universeTools.createUniverse({ title: "U1" });
        const result = await universeTools.getUniverse(u.id);
        expect(result.title).toBe("U1");
    });

    it("updateUniverse delegates to UniversesController", async () => {
        const u = await universeTools.createUniverse({ title: "U1" });
        const updated = await universeTools.updateUniverse(u.id, { title: "Updated" });
        expect(updated.title).toBe("Updated");
    });

    it("deleteUniverse delegates to UniversesController", async () => {
        const u = await universeTools.createUniverse({ title: "To Delete" });
        await universeTools.deleteUniverse(u.id);
        await expect(universeTools.getUniverse(u.id)).rejects.toThrow();
    });

    it("world objects CRUD", async () => {
        const u = await universeTools.createUniverse({ title: "U1" });

        const wo = await universeTools.createWorldObject({
            universeId: u.id, type: "CHARACTER", name: "Hero"
        });
        expect(wo.name).toBe("Hero");

        const list = await universeTools.listWorldObjects(u.id);
        expect(list).toHaveLength(1);

        const fetched = await universeTools.getWorldObject(wo.id);
        expect(fetched.name).toBe("Hero");

        const updated = await universeTools.updateWorldObject(wo.id, { name: "Villain" });
        expect(updated.name).toBe("Villain");

        await universeTools.deleteWorldObject(wo.id);
        await expect(universeTools.getWorldObject(wo.id)).rejects.toThrow();
    });

    it("timeline entries CRUD", async () => {
        const u = await universeTools.createUniverse({ title: "U1" });
        const wo = await universeTools.createWorldObject({
            universeId: u.id, type: "CHARACTER", name: "Hero"
        });

        const entry = await universeTools.addTimelineEntry({
            worldObjectId: wo.id, label: "Born", description: "In a village"
        });
        expect(entry.label).toBe("Born");

        const updated = await universeTools.updateTimelineEntry(entry.id, { label: "Birth" });
        expect(updated.label).toBe("Birth");

        await universeTools.deleteTimelineEntry(entry.id);
        const obj = await universeTools.getWorldObject(wo.id);
        expect(obj.timeline).toHaveLength(0);
    });

    it("reorderTimelineEntries", async () => {
        const u = await universeTools.createUniverse({ title: "U1" });
        const wo = await universeTools.createWorldObject({
            universeId: u.id, type: "CHARACTER", name: "Hero"
        });

        const e1 = await universeTools.addTimelineEntry({ worldObjectId: wo.id, label: "E1" });
        const e2 = await universeTools.addTimelineEntry({ worldObjectId: wo.id, label: "E2" });

        await universeTools.reorderTimelineEntries(wo.id, [e2.id, e1.id]);

        const obj = await universeTools.getWorldObject(wo.id);
        expect(obj.timeline[0].label).toBe("E2");
        expect(obj.timeline[1].label).toBe("E1");
    });

    it("transferStoryObjectToUniverse", async () => {
        const u = await universeTools.createUniverse({ title: "U1" });
        const p = await ProjectsController.createProject({ title: "P1" });

        const storyObj = await storyObjectTools.createStoryObject({
            projectId: p.id, type: "CHARACTER", name: "Alice", description: "Hero"
        });

        const worldObj = await universeTools.transferStoryObjectToUniverse(storyObj.id, u.id);
        expect(worldObj.name).toBe("Alice");

        // Original should be deleted
        await expect(storyObjectTools.getStoryObject(storyObj.id)).rejects.toThrow();
    });

    it("linkProjectToUniverse and unlinkProjectFromUniverse", async () => {
        const u = await universeTools.createUniverse({ title: "U1" });
        const p = await ProjectsController.createProject({ title: "P1" });

        await universeTools.linkProjectToUniverse(p.id, u.id);
        const universe = await universeTools.getUniverse(u.id);
        expect(universe.projects).toHaveLength(1);

        await universeTools.unlinkProjectFromUniverse(p.id);
        const universe2 = await universeTools.getUniverse(u.id);
        expect(universe2.projects).toHaveLength(0);
    });
});
