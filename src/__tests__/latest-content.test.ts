import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { getLatestContent } from "@/lib/latest-content";
import { ProjectsController } from "@/lib/controllers/projects";
import { prisma } from "@/lib/db";
import { testPrisma } from "./setup";

function createScene(projectId: string, title: string) {
    return testPrisma.structureNode.create({
        data: { projectId, type: "SCENE", title, parentId: null, orderIndex: 0, synopsis: "", status: "DRAFT" },
    });
}

function createVersion(nodeId: string, content: string, createdAt: Date) {
    return testPrisma.contentVersion.create({
        data: { nodeId, content, wordCount: 1, createdAt },
    });
}

describe("getLatestContent", () => {
    let sceneA: string;
    let sceneB: string;
    let sceneC: string;
    const originalSchema = process.env.DATABASE_SCHEMA;

    beforeEach(async () => {
        const project = await ProjectsController.createProject({ title: "Test Novel" });
        sceneA = (await createScene(project.id, "A")).id;
        sceneB = (await createScene(project.id, "B")).id;
        sceneC = (await createScene(project.id, "C")).id;

        // Newest inserted first so the result can't depend on insertion order.
        await createVersion(sceneA, "<p>A newest</p>", new Date("2026-01-03T00:00:00Z"));
        await createVersion(sceneA, "<p>A oldest</p>", new Date("2026-01-01T00:00:00Z"));
        await createVersion(sceneA, "<p>A middle</p>", new Date("2026-01-02T00:00:00Z"));
        await createVersion(sceneB, "<p>B only</p>", new Date("2026-01-01T00:00:00Z"));
    });

    afterEach(() => {
        if (originalSchema === undefined) delete process.env.DATABASE_SCHEMA;
        else process.env.DATABASE_SCHEMA = originalSchema;
    });

    function expectLatest(result: Map<string, string>) {
        expect(result.size).toBe(2);
        expect(result.get(sceneA)).toBe("<p>A newest</p>");
        expect(result.get(sceneB)).toBe("<p>B only</p>");
        expect(result.has(sceneC)).toBe(false);
    }

    it("returns only the newest content per node", async () => {
        expectLatest(await getLatestContent([sceneA, sceneB, sceneC]));
    });

    it("returns an empty map for no nodes", async () => {
        expect((await getLatestContent([])).size).toBe(0);
    });

    it("qualifies the table when DATABASE_SCHEMA is set", async () => {
        // A non-default schema: "public" would resolve identically unqualified.
        process.env.DATABASE_SCHEMA = "annie";
        const queryRaw = vi.spyOn(prisma, "$queryRaw").mockResolvedValue([]);
        try {
            await getLatestContent([sceneA]);
            const [strings, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
            const query = Prisma.sql(strings, ...values);
            expect(query.sql).toContain('FROM "annie"."ContentVersion"');
            expect(query.sql).not.toMatch(/FROM "ContentVersion"/);
        } finally {
            queryRaw.mockRestore();
        }
    });
});
