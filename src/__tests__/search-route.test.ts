import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./setup";

class MockNextRequest {
    private _body: unknown;
    nextUrl: { searchParams: URLSearchParams };

    constructor(url: string, init?: { method?: string; body?: string }) {
        this._body = init?.body ? JSON.parse(init.body) : null;
        this.nextUrl = { searchParams: new URL(url, "http://localhost").searchParams };
    }

    async json() {
        return this._body;
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

describe("Search Route /api/projects/[id]/search", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await testPrisma.project.create({
            data: { title: "Test Project" },
        });
        projectId = project.id;
    });

    it("returns 400 without query param", async () => {
        const { GET } = await import("@/app/api/projects/[id]/search/route");
        const req = mockReq(`http://localhost/api/projects/${projectId}/search`);
        const res = await GET(req as any, mockParams({ id: projectId }));
        expect(res.status).toBe(400);
    });

    it("returns 400 for empty query", async () => {
        const { GET } = await import("@/app/api/projects/[id]/search/route");
        const req = mockReq(`http://localhost/api/projects/${projectId}/search?q=`);
        const res = await GET(req as any, mockParams({ id: projectId }));
        expect(res.status).toBe(400);
    });

    it("returns 404 for missing project", async () => {
        const { GET } = await import("@/app/api/projects/[id]/search/route");
        const req = mockReq("http://localhost/api/projects/bad/search?q=test");
        const res = await GET(req as any, mockParams({ id: "bad" }));
        expect(res.status).toBe(404);
    });

    it("finds scenes by content", async () => {
        const node = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Chapter 1", orderIndex: 0 },
        });
        await testPrisma.contentVersion.create({
            data: { nodeId: node.id, content: "<p>The dragon flew over the castle</p>", wordCount: 6 },
        });

        const { GET } = await import("@/app/api/projects/[id]/search/route");
        const req = mockReq(`http://localhost/api/projects/${projectId}/search?q=dragon`);
        const res = await GET(req as any, mockParams({ id: projectId }));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.scenes.length).toBe(1);
        expect(data.scenes[0].title).toBe("Chapter 1");
    });

    it("finds scenes by title", async () => {
        await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Dragon Battle", orderIndex: 0 },
        });

        const { GET } = await import("@/app/api/projects/[id]/search/route");
        const req = mockReq(`http://localhost/api/projects/${projectId}/search?q=Dragon`);
        const res = await GET(req as any, mockParams({ id: projectId }));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.scenes.length).toBe(1);
    });

    it("finds story objects by name", async () => {
        await testPrisma.storyObject.create({
            data: { projectId, type: "CHARACTER", name: "Sir Lancelot", description: "A knight" },
        });

        const { GET } = await import("@/app/api/projects/[id]/search/route");
        const req = mockReq(`http://localhost/api/projects/${projectId}/search?q=Lancelot`);
        const res = await GET(req as any, mockParams({ id: projectId }));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.storyObjects.length).toBe(1);
        expect(data.storyObjects[0].name).toBe("Sir Lancelot");
    });

    it("finds story objects by description", async () => {
        await testPrisma.storyObject.create({
            data: { projectId, type: "LOCATION", name: "Castle", description: "A grand fortress in the mountains" },
        });

        const { GET } = await import("@/app/api/projects/[id]/search/route");
        const req = mockReq(`http://localhost/api/projects/${projectId}/search?q=fortress`);
        const res = await GET(req as any, mockParams({ id: projectId }));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.storyObjects.length).toBe(1);
    });

    it("returns totalResults count", async () => {
        const { GET } = await import("@/app/api/projects/[id]/search/route");
        const req = mockReq(`http://localhost/api/projects/${projectId}/search?q=nothing`);
        const res = await GET(req as any, mockParams({ id: projectId }));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.totalResults).toBe(0);
        expect(data.query).toBe("nothing");
    });
});
