import { describe, it, expect, beforeEach } from "vitest";
import { getSceneFocus } from "@/mcp/tools/coaching";
import { ProjectsController } from "@/lib/controllers/projects";
import { testPrisma } from "./setup";

function createNodeDirect(data: {
    projectId: string;
    type: string;
    title: string;
    parentId?: string;
    orderIndex?: number;
    status?: string;
}) {
    return testPrisma.structureNode.create({
        data: {
            projectId: data.projectId,
            type: data.type,
            title: data.title,
            parentId: data.parentId ?? null,
            orderIndex: data.orderIndex ?? 0,
            synopsis: "",
            status: data.status ?? "OUTLINE",
        },
    });
}

describe("getSceneFocus", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await ProjectsController.createProject({ title: "Test Novel" });
        projectId = project.id;
    });

    it("returns timelineScenes with id, title, status, and orderIndex", async () => {
        const ch = await createNodeDirect({ projectId, type: "CHAPTER", title: "Ch 1" });
        const s1 = await createNodeDirect({ projectId, type: "SCENE", title: "S1", parentId: ch.id, orderIndex: 0, status: "OUTLINE" });
        const s2 = await createNodeDirect({ projectId, type: "SCENE", title: "S2", parentId: ch.id, orderIndex: 1, status: "DRAFT" });

        const result = await getSceneFocus(s1.id);

        expect(result.timelineScenes).toBeDefined();
        expect(result.timelineScenes).toHaveLength(2);
        expect(result.timelineScenes[0]).toMatchObject({ id: s1.id, title: "S1", status: "OUTLINE", orderIndex: 0 });
        expect(result.timelineScenes[1]).toMatchObject({ id: s2.id, title: "S2", status: "DRAFT", orderIndex: 1 });
    });

    it("populates chapterTitle from parent node for each scene", async () => {
        const ch = await createNodeDirect({ projectId, type: "CHAPTER", title: "Chapter One" });
        const s1 = await createNodeDirect({ projectId, type: "SCENE", title: "S1", parentId: ch.id, orderIndex: 0 });

        const result = await getSceneFocus(s1.id);

        const scene = result.timelineScenes.find((s) => s.id === s1.id);
        expect(scene?.chapterTitle).toBe("Chapter One");
    });

    it("returns timelineScenes with single scene when no siblings", async () => {
        const s = await createNodeDirect({ projectId, type: "SCENE", title: "Lone Scene", orderIndex: 0 });
        const result = await getSceneFocus(s.id);
        expect(result.timelineScenes).toHaveLength(1);
        expect(result.timelineScenes[0].id).toBe(s.id);
    });

    it("throws for non-existent sceneId", async () => {
        await expect(getSceneFocus("nonexistent-id")).rejects.toThrow();
    });
});
