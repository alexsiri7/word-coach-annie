import { describe, it, expect, beforeEach } from "vitest";
import { executeTool } from "@/lib/ai/tool-executor";
import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController } from "@/lib/controllers/structure";
import { testPrisma } from "./setup";

describe("executeTool", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await ProjectsController.createProject({ title: "Test Project" });
        projectId = project.id;
    });

    it("returns error for unknown tool", async () => {
        const result = JSON.parse(await executeTool("nonexistent_tool", {}));
        expect(result.error).toBe(true);
        expect(result.message).toContain("Unknown tool");
        expect(result.availableTools).toBeInstanceOf(Array);
    });

    it("handles tool errors gracefully", async () => {
        const result = JSON.parse(await executeTool("get_project", { projectId: "nonexistent" }));
        expect(result.error).toBe(true);
        expect(result.tool).toBe("get_project");
        expect(result.message).toContain("not found");
    });

    describe("project tools", () => {
        it("list_projects", async () => {
            const result = JSON.parse(await executeTool("list_projects", {}));
            expect(result.projects).toBeInstanceOf(Array);
            expect(result.projects.length).toBeGreaterThanOrEqual(1);
        });

        it("get_project", async () => {
            const result = JSON.parse(await executeTool("get_project", { projectId }));
            expect(result.title).toBe("Test Project");
        });

        it("create_project", async () => {
            const result = JSON.parse(await executeTool("create_project", { title: "New Project" }));
            expect(result.title).toBe("New Project");
        });

        it("update_project", async () => {
            const result = JSON.parse(await executeTool("update_project", { projectId, title: "Updated" }));
            expect(result.title).toBe("Updated");
        });
    });

    describe("structure tools", () => {
        it("get_outline", async () => {
            await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch" });
            const result = JSON.parse(await executeTool("get_outline", { projectId }));
            expect(result).toBeInstanceOf(Array);
            expect(result).toHaveLength(1);
        });

        it("create_node", async () => {
            const result = JSON.parse(await executeTool("create_node", { projectId, type: "CHAPTER", title: "Ch 1" }));
            expect(result.title).toBe("Ch 1");
        });

        it("update_node", async () => {
            const node = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch" });
            const result = JSON.parse(await executeTool("update_node", { nodeId: node.id, title: "Updated" }));
            expect(result.title).toBe("Updated");
        });

        it("delete_node", async () => {
            const node = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch" });
            const result = JSON.parse(await executeTool("delete_node", { nodeId: node.id }));
            expect(result.deleted).toBe(true);
        });

        it("write_scene_content with content string", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
            const result = JSON.parse(await executeTool("write_scene_content", { nodeId: scene.id, content: "Hello world" }));
            expect(result.wordCount).toBe(2);
        });

        it("write_scene_content with blocks", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
            const result = JSON.parse(await executeTool("write_scene_content", {
                nodeId: scene.id,
                blocks: [{ type: "CONTENT", content: "<p>Hello</p>" }]
            }));
            expect(result.wordCount).toBeGreaterThan(0);
        });

        it("read_scene_content", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
            await StructureController.writeSceneContent(scene.id, "Test content");
            const result = JSON.parse(await executeTool("read_scene_content", { nodeId: scene.id }));
            expect(result.content).toBe("Test content");
        });

        it("get_scene_versions", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
            const result = JSON.parse(await executeTool("get_scene_versions", { nodeId: scene.id }));
            expect(result.versions).toBeInstanceOf(Array);
        });

        it("restore_scene_version", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
            await StructureController.writeSceneContent(scene.id, "Original");
            const versions = await StructureController.getSceneVersions(scene.id);
            const vid = versions.versions[0].id;
            await StructureController.writeSceneContent(scene.id, "Changed");
            const result = JSON.parse(await executeTool("restore_scene_version", { nodeId: scene.id, versionId: vid }));
            expect(result.restoredFromVersionId).toBe(vid);
        });

        it("add_annotation", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
            const result = JSON.parse(await executeTool("add_annotation", { nodeId: scene.id, content: "Note" }));
            expect(result.content).toBe("Note");
        });

        it("update_annotation", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
            const ann = await StructureController.addAnnotation(scene.id, "Old");
            const result = JSON.parse(await executeTool("update_annotation", { annotationId: ann.id, content: "New" }));
            expect(result.content).toBe("New");
        });

        it("delete_annotation", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
            const ann = await StructureController.addAnnotation(scene.id, "To delete");
            await executeTool("delete_annotation", { annotationId: ann.id });
            const content = await StructureController.readSceneContent(scene.id);
            expect(content.annotations).toHaveLength(0);
        });

        it("resolve_annotation", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
            const ann = await StructureController.addAnnotation(scene.id, "Note");
            const result = JSON.parse(await executeTool("resolve_annotation", { annotationId: ann.id, resolved: true }));
            expect(result.resolved).toBe(true);
        });

        it("get_open_annotations", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
            await StructureController.addAnnotation(scene.id, "Open");
            const result = JSON.parse(await executeTool("get_open_annotations", { projectId }));
            expect(result).toHaveLength(1);
        });
    });

    describe("story object tools", () => {
        it("create_story_object", async () => {
            const result = JSON.parse(await executeTool("create_story_object", {
                projectId, type: "CHARACTER", name: "Alice"
            }));
            expect(result.name).toBe("Alice");
        });

        it("list_story_objects", async () => {
            await testPrisma.storyObject.create({ data: { projectId, type: "CHARACTER", name: "Alice" } });
            const result = JSON.parse(await executeTool("list_story_objects", { projectId }));
            expect(result.objects).toHaveLength(1);
        });

        it("get_story_object", async () => {
            const obj = await testPrisma.storyObject.create({ data: { projectId, type: "CHARACTER", name: "Alice" } });
            const result = JSON.parse(await executeTool("get_story_object", { objectId: obj.id }));
            expect(result.name).toBe("Alice");
        });

        it("update_story_object", async () => {
            const obj = await testPrisma.storyObject.create({ data: { projectId, type: "CHARACTER", name: "Alice" } });
            const result = JSON.parse(await executeTool("update_story_object", { objectId: obj.id, name: "Bob" }));
            expect(result.name).toBe("Bob");
        });

        it("delete_story_object", async () => {
            const obj = await testPrisma.storyObject.create({ data: { projectId, type: "CHARACTER", name: "Alice" } });
            const result = JSON.parse(await executeTool("delete_story_object", { objectId: obj.id }));
            expect(result.deleted).toBe(true);
        });
    });

    describe("relationship tools", () => {
        it("create_relationship", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
            const char = await testPrisma.storyObject.create({ data: { projectId, type: "CHARACTER", name: "A" } });
            const result = JSON.parse(await executeTool("create_relationship", {
                projectId, type: "APPEARS_IN", fromObjectId: char.id, toNodeId: scene.id
            }));
            expect(result.type).toBe("APPEARS_IN");
        });

        it("list_relationships", async () => {
            const result = JSON.parse(await executeTool("list_relationships", { projectId }));
            expect(result.relationships).toBeInstanceOf(Array);
        });

        it("delete_relationship", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
            const char = await testPrisma.storyObject.create({ data: { projectId, type: "CHARACTER", name: "A" } });
            const rel = await testPrisma.relationship.create({
                data: { type: "APPEARS_IN", fromObjectId: char.id, toNodeId: scene.id }
            });
            const result = JSON.parse(await executeTool("delete_relationship", { relationshipId: rel.id }));
            expect(result.deleted).toBe(true);
        });
    });

    describe("universe tools", () => {
        it("create_universe", async () => {
            const result = JSON.parse(await executeTool("create_universe", { title: "U1" }));
            expect(result.title).toBe("U1");
        });

        it("list_universes", async () => {
            await executeTool("create_universe", { title: "U1" });
            const result = JSON.parse(await executeTool("list_universes", {}));
            expect(result.length).toBeGreaterThanOrEqual(1);
        });

        it("get_universe", async () => {
            const u = JSON.parse(await executeTool("create_universe", { title: "U1" }));
            const result = JSON.parse(await executeTool("get_universe", { universeId: u.id }));
            expect(result.title).toBe("U1");
        });

        it("update_universe", async () => {
            const u = JSON.parse(await executeTool("create_universe", { title: "U1" }));
            const result = JSON.parse(await executeTool("update_universe", { universeId: u.id, title: "Updated" }));
            expect(result.title).toBe("Updated");
        });

        it("delete_universe", async () => {
            const u = JSON.parse(await executeTool("create_universe", { title: "To Delete" }));
            await executeTool("delete_universe", { universeId: u.id });
            const result = JSON.parse(await executeTool("get_universe", { universeId: u.id }));
            expect(result.error).toBe(true);
        });

        it("create_world_object", async () => {
            const u = JSON.parse(await executeTool("create_universe", { title: "U1" }));
            const result = JSON.parse(await executeTool("create_world_object", {
                universeId: u.id, type: "CHARACTER", name: "Hero"
            }));
            expect(result.name).toBe("Hero");
        });

        it("list_world_objects", async () => {
            const u = JSON.parse(await executeTool("create_universe", { title: "U1" }));
            await executeTool("create_world_object", { universeId: u.id, type: "CHARACTER", name: "Hero" });
            const result = JSON.parse(await executeTool("list_world_objects", { universeId: u.id }));
            expect(result).toHaveLength(1);
        });

        it("get_world_object", async () => {
            const u = JSON.parse(await executeTool("create_universe", { title: "U1" }));
            const wo = JSON.parse(await executeTool("create_world_object", { universeId: u.id, type: "CHARACTER", name: "Hero" }));
            const result = JSON.parse(await executeTool("get_world_object", { objectId: wo.id }));
            expect(result.name).toBe("Hero");
        });

        it("update_world_object", async () => {
            const u = JSON.parse(await executeTool("create_universe", { title: "U1" }));
            const wo = JSON.parse(await executeTool("create_world_object", { universeId: u.id, type: "CHARACTER", name: "Hero" }));
            const result = JSON.parse(await executeTool("update_world_object", { objectId: wo.id, name: "Villain" }));
            expect(result.name).toBe("Villain");
        });

        it("delete_world_object", async () => {
            const u = JSON.parse(await executeTool("create_universe", { title: "U1" }));
            const wo = JSON.parse(await executeTool("create_world_object", { universeId: u.id, type: "CHARACTER", name: "Hero" }));
            await executeTool("delete_world_object", { objectId: wo.id });
            const result = JSON.parse(await executeTool("get_world_object", { objectId: wo.id }));
            expect(result.error).toBe(true);
        });

        it("timeline entry CRUD", async () => {
            const u = JSON.parse(await executeTool("create_universe", { title: "U1" }));
            const wo = JSON.parse(await executeTool("create_world_object", { universeId: u.id, type: "CHARACTER", name: "Hero" }));

            const entry = JSON.parse(await executeTool("add_timeline_entry", {
                worldObjectId: wo.id, label: "Born"
            }));
            expect(entry.label).toBe("Born");

            const updated = JSON.parse(await executeTool("update_timeline_entry", {
                entryId: entry.id, label: "Birth"
            }));
            expect(updated.label).toBe("Birth");

            await executeTool("delete_timeline_entry", { entryId: entry.id });
        });

        it("reorder_timeline_entries", async () => {
            const u = JSON.parse(await executeTool("create_universe", { title: "U1" }));
            const wo = JSON.parse(await executeTool("create_world_object", { universeId: u.id, type: "CHARACTER", name: "Hero" }));
            const e1 = JSON.parse(await executeTool("add_timeline_entry", { worldObjectId: wo.id, label: "E1" }));
            const e2 = JSON.parse(await executeTool("add_timeline_entry", { worldObjectId: wo.id, label: "E2" }));
            await executeTool("reorder_timeline_entries", { worldObjectId: wo.id, orderedIds: [e2.id, e1.id] });
        });

        it("transfer_story_object_to_universe", async () => {
            const u = JSON.parse(await executeTool("create_universe", { title: "U1" }));
            const obj = await testPrisma.storyObject.create({ data: { projectId, type: "CHARACTER", name: "Alice" } });
            const result = JSON.parse(await executeTool("transfer_story_object_to_universe", {
                storyObjectId: obj.id, universeId: u.id
            }));
            expect(result.name).toBe("Alice");
        });

        it("link_project_to_universe", async () => {
            const u = JSON.parse(await executeTool("create_universe", { title: "U1" }));
            await executeTool("link_project_to_universe", { projectId, universeId: u.id });
            const universe = JSON.parse(await executeTool("get_universe", { universeId: u.id }));
            expect(universe.projects).toHaveLength(1);
        });

        it("unlink_project_from_universe", async () => {
            const u = JSON.parse(await executeTool("create_universe", { title: "U1" }));
            await executeTool("link_project_to_universe", { projectId, universeId: u.id });
            await executeTool("unlink_project_from_universe", { projectId });
        });
    });

    describe("export tools", () => {
        it("export_manuscript", async () => {
            const result = JSON.parse(await executeTool("export_manuscript", { projectId }));
            expect(result).toContain("# Test Project");
        });

        it("export_story_bible", async () => {
            const result = JSON.parse(await executeTool("export_story_bible", { projectId }));
            expect(result).toContain("Story Bible");
        });

        it("export_medium", async () => {
            await executeTool("export_medium", { projectId });
        });

        it("get_project_summary", async () => {
            const result = JSON.parse(await executeTool("get_project_summary", { projectId }));
            expect(result.project.title).toBe("Test Project");
        });

        it("list_skills", async () => {
            const result = JSON.parse(await executeTool("list_skills", {}));
            expect(result).toBeInstanceOf(Array);
        });
    });

    describe("google auth tools", () => {
        it("google_auth_status returns disconnected", async () => {
            const result = JSON.parse(await executeTool("google_auth_status", {}));
            expect(result.connected).toBe(false);
        });

        it("google_auth_disconnect succeeds", async () => {
            const result = JSON.parse(await executeTool("google_auth_disconnect", {}));
            expect(result.success).toBe(true);
        });
    });
});
