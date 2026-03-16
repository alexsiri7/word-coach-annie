import { describe, it, expect, beforeEach } from "vitest";
import { TimelineController } from "@/lib/controllers/timeline";
import { ProjectsController } from "@/lib/controllers/projects";
import { testPrisma } from "./setup";

describe("TimelineController", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await ProjectsController.createProject({ title: "Test Project" });
        projectId = project.id;
    });

    describe("getTimelineData", () => {
        it("returns empty data for empty project", async () => {
            const data = await TimelineController.getTimelineData(projectId);
            expect(data.scenes).toHaveLength(0);
            expect(data.objects).toHaveLength(0);
            expect(data.events).toHaveLength(0);
        });

        it("returns scenes in tree traversal order", async () => {
            // Create nodes directly via prisma to avoid 20+ sequential DB calls
            // through the controller's validation layer (which causes timeouts under load)
            const ch1 = await testPrisma.structureNode.create({
                data: { projectId, type: "CHAPTER", title: "Ch 1", orderIndex: 0, synopsis: "", status: "OUTLINE" },
            });
            const ch2 = await testPrisma.structureNode.create({
                data: { projectId, type: "CHAPTER", title: "Ch 2", orderIndex: 1, synopsis: "", status: "OUTLINE" },
            });
            await testPrisma.structureNode.createMany({
                data: [
                    { projectId, type: "SCENE", title: "Scene 1.1", parentId: ch1.id, orderIndex: 0, synopsis: "", status: "OUTLINE" },
                    { projectId, type: "SCENE", title: "Scene 1.2", parentId: ch1.id, orderIndex: 1, synopsis: "", status: "OUTLINE" },
                    { projectId, type: "SCENE", title: "Scene 2.1", parentId: ch2.id, orderIndex: 0, synopsis: "", status: "OUTLINE" },
                ],
            });

            const data = await TimelineController.getTimelineData(projectId);
            expect(data.scenes).toHaveLength(3);
            expect(data.scenes[0].title).toBe("Scene 1.1");
            expect(data.scenes[1].title).toBe("Scene 1.2");
            expect(data.scenes[2].title).toBe("Scene 2.1");
        });

        it("returns story objects", async () => {
            await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "Alice" }
            });
            await testPrisma.storyObject.create({
                data: { projectId, type: "LOCATION", name: "Castle" }
            });

            const data = await TimelineController.getTimelineData(projectId);
            expect(data.objects).toHaveLength(2);
        });

        it("returns events linking objects to scenes", async () => {
            const ch = await testPrisma.structureNode.create({
                data: { projectId, type: "CHAPTER", title: "Ch 1", orderIndex: 0, synopsis: "", status: "OUTLINE" },
            });
            const scene = await testPrisma.structureNode.create({
                data: { projectId, type: "SCENE", title: "Scene 1", parentId: ch.id, orderIndex: 0, synopsis: "", status: "OUTLINE" },
            });

            const char = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "Alice" }
            });

            await testPrisma.relationship.create({
                data: { type: "APPEARS_IN", fromObjectId: char.id, toNodeId: scene.id }
            });

            const data = await TimelineController.getTimelineData(projectId);
            expect(data.events).toHaveLength(1);
            expect(data.events[0].type).toBe("APPEARS_IN");
        });

        it("handles scenes without parent (root-level scenes)", async () => {
            await testPrisma.structureNode.create({
                data: { projectId, type: "SCENE", title: "Standalone Scene", orderIndex: 0, synopsis: "", status: "OUTLINE" },
            });

            const data = await TimelineController.getTimelineData(projectId);
            expect(data.scenes).toHaveLength(1);
            expect(data.scenes[0].title).toBe("Standalone Scene");
        });
    });
});
