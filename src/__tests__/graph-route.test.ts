import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./setup";

class MockNextRequest {
    private _body: unknown;
    nextUrl: { searchParams: URLSearchParams };
    headers: Map<string, string>;

    constructor(url: string, init?: { method?: string; body?: string }) {
        this._body = init?.body ? JSON.parse(init.body) : null;
        this.nextUrl = { searchParams: new URL(url, "http://localhost").searchParams };
        this.headers = new Map();
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

describe("GET /api/projects/[id]/graph", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await testPrisma.project.create({
            data: { title: "Graph Test Project" },
        });
        projectId = project.id;
    });

    it("returns empty graph for project with no data", async () => {
        const { GET } = await import("@/app/api/projects/[id]/graph/route");
        const req = mockReq(`http://localhost/api/projects/${projectId}/graph`);
        const res = await GET(req as never, mockParams({ id: projectId }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.nodes).toEqual([]);
        expect(body.edges).toEqual([]);
    });

    it("returns nodes for structure nodes and story objects", async () => {
        await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Opening Scene", orderIndex: 0 },
        });
        await testPrisma.storyObject.create({
            data: { projectId, type: "CHARACTER", name: "Alice" },
        });

        const { GET } = await import("@/app/api/projects/[id]/graph/route");
        const req = mockReq(`http://localhost/api/projects/${projectId}/graph`);
        const res = await GET(req as never, mockParams({ id: projectId }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.nodes).toHaveLength(2);

        const sceneNode = body.nodes.find((n: { entityType: string }) => n.entityType === "SCENE");
        expect(sceneNode).toBeDefined();
        expect(sceneNode.label).toBe("Opening Scene");
        expect(sceneNode.type).toBe("structureNode");

        const charNode = body.nodes.find((n: { entityType: string }) => n.entityType === "CHARACTER");
        expect(charNode).toBeDefined();
        expect(charNode.label).toBe("Alice");
        expect(charNode.type).toBe("storyObject");
    });

    it("returns edges for relationships", async () => {
        const scene = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Scene 1", orderIndex: 0 },
        });
        const character = await testPrisma.storyObject.create({
            data: { projectId, type: "CHARACTER", name: "Bob" },
        });
        await testPrisma.relationship.create({
            data: {
                type: "APPEARS_IN",
                label: "appears in",
                fromObjectId: character.id,
                toNodeId: scene.id,
            },
        });

        const { GET } = await import("@/app/api/projects/[id]/graph/route");
        const req = mockReq(`http://localhost/api/projects/${projectId}/graph`);
        const res = await GET(req as never, mockParams({ id: projectId }));
        const body = await res.json();

        expect(body.edges).toHaveLength(1);
        expect(body.edges[0].source).toBe(character.id);
        expect(body.edges[0].target).toBe(scene.id);
        expect(body.edges[0].type).toBe("APPEARS_IN");
        expect(body.edges[0].label).toBe("appears in");
    });

    it("returns 404 for non-existent project", async () => {
        const { GET } = await import("@/app/api/projects/[id]/graph/route");
        const req = mockReq("http://localhost/api/projects/nonexistent/graph");
        const res = await GET(req as never, mockParams({ id: "nonexistent" }));

        expect(res.status).toBe(404);
    });
});
