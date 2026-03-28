import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./setup";

class MockNextRequest {
    nextUrl: { searchParams: URLSearchParams };
    headers: Map<string, string>;

    constructor(url: string) {
        this.nextUrl = { searchParams: new URL(url, "http://localhost").searchParams };
        this.headers = new Map();
    }
}

const MockNextResponse = {
    json: (data: unknown, init?: { status?: number }) => ({
        data,
        status: init?.status || 200,
        async json() { return data; },
    }),
};

vi.mock("next/server", () => ({
    NextRequest: MockNextRequest,
    NextResponse: MockNextResponse,
}));

function mockReq(url: string) {
    return new MockNextRequest(url);
}

function mockParams<T>(params: T): { params: Promise<T> } {
    return { params: Promise.resolve(params) };
}

describe("GET /api/projects/[id]/plot-thread-status", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await testPrisma.project.create({
            data: { title: "Plot Thread Test Project" },
        });
        projectId = project.id;
    });

    it("returns empty array when no plotlines exist", async () => {
        const chapter = await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Chapter 1", orderIndex: 0 },
        });
        await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Scene 1", orderIndex: 0, parentId: chapter.id },
        });

        const { GET } = await import("@/app/api/projects/[id]/plot-thread-status/route");
        const req = mockReq(`http://localhost/api/projects/${projectId}/plot-thread-status`);
        const res = await GET(req as never, mockParams({ id: projectId }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toEqual([]);
    });

    it("returns empty array when no scenes exist", async () => {
        await testPrisma.storyObject.create({
            data: { projectId, type: "PLOTLINE", name: "The Main Quest" },
        });

        const { GET } = await import("@/app/api/projects/[id]/plot-thread-status/route");
        const req = mockReq(`http://localhost/api/projects/${projectId}/plot-thread-status`);
        const res = await GET(req as never, mockParams({ id: projectId }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toEqual([]);
    });

    it("marks first appearance of plotline as 'mentioned'", async () => {
        const chapter = await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Chapter 1", orderIndex: 0 },
        });
        const scene1 = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Scene 1", orderIndex: 0, parentId: chapter.id },
        });
        const plotline = await testPrisma.storyObject.create({
            data: { projectId, type: "PLOTLINE", name: "The Heist" },
        });
        await testPrisma.relationship.create({
            data: { type: "PART_OF_PLOTLINE", fromObjectId: plotline.id, toNodeId: scene1.id },
        });

        const { GET } = await import("@/app/api/projects/[id]/plot-thread-status/route");
        const req = mockReq(`http://localhost/api/projects/${projectId}/plot-thread-status`);
        const res = await GET(req as never, mockParams({ id: projectId }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toHaveLength(1);
        expect(body[0].sceneId).toBe(scene1.id);
        const indicator = body[0].indicators.find((i: { id: string }) => i.id === plotline.id);
        expect(indicator).toBeDefined();
        expect(indicator.status).toBe("mentioned");
    });

    it("marks continuing plotline as 'advancing' after first appearance", async () => {
        const chapter = await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Chapter 1", orderIndex: 0 },
        });
        const scene1 = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Scene 1", orderIndex: 0, parentId: chapter.id },
        });
        const scene2 = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Scene 2", orderIndex: 1, parentId: chapter.id },
        });
        const plotline = await testPrisma.storyObject.create({
            data: { projectId, type: "PLOTLINE", name: "The Heist" },
        });
        await testPrisma.relationship.create({
            data: { type: "PART_OF_PLOTLINE", fromObjectId: plotline.id, toNodeId: scene1.id },
        });
        await testPrisma.relationship.create({
            data: { type: "PART_OF_PLOTLINE", fromObjectId: plotline.id, toNodeId: scene2.id },
        });

        const { GET } = await import("@/app/api/projects/[id]/plot-thread-status/route");
        const req = mockReq(`http://localhost/api/projects/${projectId}/plot-thread-status`);
        const res = await GET(req as never, mockParams({ id: projectId }));
        const body = await res.json();

        expect(res.status).toBe(200);
        // Scene 1: mentioned (first appearance)
        const s1Entry = body.find((e: { sceneId: string }) => e.sceneId === scene1.id);
        expect(s1Entry.indicators.find((i: { id: string }) => i.id === plotline.id)?.status).toBe("mentioned");
        // Scene 2: advancing (seen before)
        const s2Entry = body.find((e: { sceneId: string }) => e.sceneId === scene2.id);
        expect(s2Entry.indicators.find((i: { id: string }) => i.id === plotline.id)?.status).toBe("advancing");
    });

    it("marks absent plotline as 'dormant' after first appearance", async () => {
        const chapter = await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Chapter 1", orderIndex: 0 },
        });
        const scene1 = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Scene 1", orderIndex: 0, parentId: chapter.id },
        });
        const scene2 = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Scene 2", orderIndex: 1, parentId: chapter.id },
        });
        const plotline = await testPrisma.storyObject.create({
            data: { projectId, type: "PLOTLINE", name: "The Heist" },
        });
        // Link plotline only to scene1, not scene2
        await testPrisma.relationship.create({
            data: { type: "PART_OF_PLOTLINE", fromObjectId: plotline.id, toNodeId: scene1.id },
        });

        const { GET } = await import("@/app/api/projects/[id]/plot-thread-status/route");
        const req = mockReq(`http://localhost/api/projects/${projectId}/plot-thread-status`);
        const res = await GET(req as never, mockParams({ id: projectId }));
        const body = await res.json();

        // Scene 2: dormant (was seen in scene1 but absent here)
        const s2Entry = body.find((e: { sceneId: string }) => e.sceneId === scene2.id);
        expect(s2Entry).toBeDefined();
        const dormantIndicator = s2Entry.indicators.find(
            (i: { id: string; status: string }) => i.id === plotline.id && i.status === "dormant"
        );
        expect(dormantIndicator).toBeDefined();
        expect(dormantIndicator.lastSeenTitle).toBe("Scene 1");
    });

    it("returns 404 for non-existent project", async () => {
        const { GET } = await import("@/app/api/projects/[id]/plot-thread-status/route");
        const req = mockReq("http://localhost/api/projects/nonexistent/plot-thread-status");
        const res = await GET(req as never, mockParams({ id: "nonexistent" }));

        expect(res.status).toBe(404);
    });
});
