import { describe, it, expect } from "vitest";
import { UniversesController } from "../lib/controllers/universes";
import { ProjectsController } from "../lib/controllers/projects";
import { testPrisma } from "./setup";

describe("UniversesController", () => {
    it("should create and list universes", async () => {
        const universe = await UniversesController.createUniverse({
            title: "Test Universe",
            description: "A test universe"
        });

        expect(universe.title).toBe("Test Universe");
        expect(universe.description).toBe("A test universe");

        const universes = await UniversesController.listUniverses();
        expect(universes).toHaveLength(1);
        expect(universes[0].title).toBe("Test Universe");
    });

    it("should get a single universe with related data", async () => {
        const u = await UniversesController.createUniverse({ title: "U1" });
        const p = await ProjectsController.createProject({ title: "P1" });
        await UniversesController.linkProjectToUniverse(p.id, u.id);

        const _wo = await UniversesController.createWorldObject({
            universeId: u.id,
            type: "CHARACTER",
            name: "Hero"
        });

        const universe = await UniversesController.getUniverse(u.id);
        expect(universe.title).toBe("U1");
        expect(universe.projects).toHaveLength(1);
        expect(universe.projects[0].title).toBe("P1");
        expect(universe.worldObjects).toHaveLength(1);
        expect(universe.worldObjects[0].name).toBe("Hero");
    });

    it("should handle world objects and timeline entries", async () => {
        const u = await UniversesController.createUniverse({ title: "U1" });
        const wo = await UniversesController.createWorldObject({
            universeId: u.id,
            type: "CHARACTER",
            name: "Hero"
        });

        const _e1 = await UniversesController.addTimelineEntry({
            worldObjectId: wo.id,
            label: "Birth",
            description: "Born in a village"
        });

        const _e2 = await UniversesController.addTimelineEntry({
            worldObjectId: wo.id,
            label: "War",
            description: "Fought in the war",
            orderIndex: 5
        });

        const woWithTimeline = await UniversesController.getWorldObject(wo.id);
        expect(woWithTimeline.timeline).toHaveLength(2);
        expect(woWithTimeline.timeline[0].label).toBe("Birth");
        expect(woWithTimeline.timeline[1].label).toBe("War");
        expect(woWithTimeline.timeline[1].orderIndex).toBe(5);
    });

    it("should reorder timeline entries", async () => {
        const u = await UniversesController.createUniverse({ title: "U1" });
        const wo = await UniversesController.createWorldObject({
            universeId: u.id,
            type: "CHARACTER",
            name: "Hero"
        });

        const e1 = await UniversesController.addTimelineEntry({ worldObjectId: wo.id, label: "E1" });
        const e2 = await UniversesController.addTimelineEntry({ worldObjectId: wo.id, label: "E2" });

        await UniversesController.reorderTimelineEntries(wo.id, [e2.id, e1.id]);

        const woWithTimeline = await UniversesController.getWorldObject(wo.id);
        expect(woWithTimeline.timeline[0].label).toBe("E2");
        expect(woWithTimeline.timeline[1].label).toBe("E1");
    });

    it("should link and unlink projects", async () => {
        const u = await UniversesController.createUniverse({ title: "U1" });
        const p = await ProjectsController.createProject({ title: "P1" });

        await UniversesController.linkProjectToUniverse(p.id, u.id);
        const _project = await ProjectsController.getProject(p.id);
        // We need to check the raw prisma here or update ProjectsController to include universeId
        const dbProject = await testPrisma.project.findUnique({ where: { id: p.id } });
        expect(dbProject?.universeId).toBe(u.id);

        await UniversesController.unlinkProjectFromUniverse(p.id);
        const dbProject2 = await testPrisma.project.findUnique({ where: { id: p.id } });
        expect(dbProject2?.universeId).toBeNull();
    });
});
