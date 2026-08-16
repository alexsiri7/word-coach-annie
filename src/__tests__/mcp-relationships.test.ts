import { describe, it, expect, beforeEach } from "vitest";
import { listRelationships, createRelationship, deleteRelationship } from "@/mcp/tools/relationships";
import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController } from "@/lib/controllers/structure";
import { UniversesController } from "@/lib/controllers/universes";
import { testPrisma } from "./setup";

describe("MCP Relationships Tools", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await ProjectsController.createProject({ title: "Test Project" });
        projectId = project.id;
    });

    describe("listRelationships", () => {
        it("lists all relationships for a project", async () => {
            const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "Scene 1", parentId: ch.id });
            const char = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "Alice" }
            });

            await testPrisma.relationship.create({
                data: { type: "APPEARS_IN", fromObjectId: char.id, toNodeId: scene.id }
            });

            const result = await listRelationships(projectId);
            expect(result.relationships).toHaveLength(1);
            expect(result.total).toBe(1);
            expect(result.relationships[0].type).toBe("APPEARS_IN");
            expect(result.relationships[0].from?.name).toBe("Alice");
            expect(result.relationships[0].to?.name).toBe("Scene 1");
        });

        it("returns empty for project with no relationships", async () => {
            const result = await listRelationships(projectId);
            expect(result.relationships).toHaveLength(0);
            expect(result.total).toBe(0);
        });

        it("throws for non-existent project", async () => {
            await expect(listRelationships("bad")).rejects.toThrow("Project not found");
        });
    });

    describe("createRelationship", () => {
        it("creates object-to-node relationship", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "Scene 1" });
            const char = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "Alice" }
            });

            const rel = await createRelationship({
                projectId,
                type: "APPEARS_IN",
                fromObjectId: char.id,
                toNodeId: scene.id,
                label: "as hero"
            });

            expect(rel.type).toBe("APPEARS_IN");
            expect(rel.label).toBe("as hero");
            expect(rel.from?.name).toBe("Alice");
            expect(rel.to?.name).toBe("Scene 1");
        });

        it("creates object-to-object relationship", async () => {
            const char1 = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "Alice" }
            });
            const char2 = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "Bob" }
            });

            const rel = await createRelationship({
                projectId,
                type: "RELATED_TO",
                fromObjectId: char1.id,
                toObjectId: char2.id,
                label: "siblings"
            });

            expect(rel.from?.name).toBe("Alice");
            expect(rel.to?.name).toBe("Bob");
        });

        it("throws for invalid type", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
            const char = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "A" }
            });

            await expect(
                createRelationship({ projectId, type: "INVALID", fromObjectId: char.id, toNodeId: scene.id })
            ).rejects.toThrow("Invalid type");
        });

        it("throws when no from-field provided", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });

            await expect(
                createRelationship({ projectId, type: "APPEARS_IN", toNodeId: scene.id })
            ).rejects.toThrow("Exactly one from-field must be provided");
        });

        it("throws when no to-field provided", async () => {
            const char = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "A" }
            });

            await expect(
                createRelationship({ projectId, type: "APPEARS_IN", fromObjectId: char.id })
            ).rejects.toThrow("Exactly one to-field must be provided");
        });

        it("creates relationship from local story object to universe world object", async () => {
            const universe = await UniversesController.createUniverse({ title: "Test Universe" });
            await UniversesController.linkProjectToUniverse(projectId, universe.id);
            const worldObj = await testPrisma.worldObject.create({
                data: { universeId: universe.id, type: "CHARACTER", name: "Universe Alice" }
            });
            const localChar = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "Local Bob" }
            });

            const rel = await createRelationship({
                projectId,
                type: "RELATED_TO",
                fromObjectId: localChar.id,
                toObjectId: worldObj.id,
            });

            expect(rel.from?.name).toBe("Local Bob");
            expect(rel.to?.name).toBe("Universe Alice");
        });

        it("creates relationship from universe world object to local story object", async () => {
            const universe = await UniversesController.createUniverse({ title: "Test Universe" });
            await UniversesController.linkProjectToUniverse(projectId, universe.id);
            const worldObj = await testPrisma.worldObject.create({
                data: { universeId: universe.id, type: "CHARACTER", name: "Universe Alice" }
            });
            const localScene = await StructureController.createNode({ projectId, type: "SCENE", title: "Scene 1" });

            const rel = await createRelationship({
                projectId,
                type: "APPEARS_IN",
                fromObjectId: worldObj.id,
                toNodeId: localScene.id,
            });

            expect(rel.from?.name).toBe("Universe Alice");
            expect(rel.to?.name).toBe("Scene 1");
        });

        it("throws for world object ID when project has no linked universe", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
            await expect(
                createRelationship({ projectId, type: "APPEARS_IN", fromObjectId: "non-existent-world-obj", toNodeId: scene.id })
            ).rejects.toThrow("fromObjectId not found");
        });

        it("throws for world object ID in toObjectId when project has no linked universe", async () => {
            const char = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "A" }
            });
            await expect(
                createRelationship({ projectId, type: "APPEARS_IN", fromObjectId: char.id, toObjectId: "non-existent-world-obj" })
            ).rejects.toThrow("toObjectId not found");
        });

        it("throws for world object ID in toObjectId when not found in linked universe", async () => {
            const universe = await UniversesController.createUniverse({ title: "Test Universe" });
            await UniversesController.linkProjectToUniverse(projectId, universe.id);
            const char = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "A" }
            });
            await expect(
                createRelationship({ projectId, type: "RELATED_TO", fromObjectId: char.id, toObjectId: "non-existent-world-obj" })
            ).rejects.toThrow("toObjectId not found in this project or linked universe");
        });

        it("throws for non-existent fromObjectId", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });

            await expect(
                createRelationship({ projectId, type: "APPEARS_IN", fromObjectId: "bad", toNodeId: scene.id })
            ).rejects.toThrow("fromObjectId not found");
        });

        it("throws for non-existent toNodeId", async () => {
            const char = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "A" }
            });

            await expect(
                createRelationship({ projectId, type: "APPEARS_IN", fromObjectId: char.id, toNodeId: "bad" })
            ).rejects.toThrow("toNodeId not found");
        });
    });

    describe("deleteRelationship", () => {
        it("deletes a relationship", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1" });
            const char = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "Alice" }
            });

            const rel = await testPrisma.relationship.create({
                data: { type: "APPEARS_IN", fromObjectId: char.id, toNodeId: scene.id }
            });

            const result = await deleteRelationship(rel.id);
            expect(result.deleted).toBe(true);
            expect(result.description).toContain("Alice");
        });

        it("throws for non-existent relationship", async () => {
            await expect(deleteRelationship("bad")).rejects.toThrow("Relationship not found");
        });
    });
});
