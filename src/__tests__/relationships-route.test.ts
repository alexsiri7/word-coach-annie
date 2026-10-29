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

function mockReq(url: string, body?: unknown) {
    return new MockNextRequest(url, body ? { body: JSON.stringify(body) } : undefined);
}

function mockParams<T>(params: T): { params: Promise<T> } {
    return { params: Promise.resolve(params) };
}

describe("Relationships Route /api/relationships/[id]", () => {
    let projectId: string;
    let nodeId: string;
    let objectId: string;
    let relationshipId: string;

    beforeEach(async () => {
        const project = await testPrisma.project.create({
            data: { title: "Test Project" },
        });
        projectId = project.id;

        const node = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Scene 1", orderIndex: 0 },
        });
        nodeId = node.id;

        const obj = await testPrisma.storyObject.create({
            data: { projectId, type: "CHARACTER", name: "Alice" },
        });
        objectId = obj.id;

        const rel = await testPrisma.relationship.create({
            data: {
                type: "APPEARS_IN",
                fromObjectId: objectId,
                toNodeId: nodeId,
            },
        });
        relationshipId = rel.id;
    });

    describe("GET", () => {
        it("returns relationship with included entities", async () => {
            const { GET } = await import("@/app/api/relationships/[id]/route");
            const req = mockReq(`http://localhost/api/relationships/${relationshipId}`);
            const res = await GET(req as any, mockParams({ id: relationshipId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.type).toBe("APPEARS_IN");
            expect(data.fromObject).toBeDefined();
            expect(data.toNode).toBeDefined();
        });

        it("returns 404 for missing relationship", async () => {
            const { GET } = await import("@/app/api/relationships/[id]/route");
            const req = mockReq("http://localhost/api/relationships/bad");
            const res = await GET(req as any, mockParams({ id: "bad" }));
            expect(res.status).toBe(404);
        });
    });

    describe("PATCH", () => {
        it("updates relationship type", async () => {
            const { PATCH } = await import("@/app/api/relationships/[id]/route");
            const req = mockReq(`http://localhost/api/relationships/${relationshipId}`, {
                type: "RELATED_TO",
            });
            const res = await PATCH(req as any, mockParams({ id: relationshipId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.type).toBe("RELATED_TO");
        });

        it("updates relationship label", async () => {
            const { PATCH } = await import("@/app/api/relationships/[id]/route");
            const req = mockReq(`http://localhost/api/relationships/${relationshipId}`, {
                label: "protagonist",
            });
            const res = await PATCH(req as any, mockParams({ id: relationshipId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.label).toBe("protagonist");
        });

        it("sanitizes HTML in label", async () => {
            const { PATCH } = await import("@/app/api/relationships/[id]/route");
            const req = mockReq(`http://localhost/api/relationships/${relationshipId}`, {
                label: '<script>alert("xss")</script>clean',
            });
            const res = await PATCH(req as any, mockParams({ id: relationshipId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.label).toBe("clean");
        });

        it("sanitizes inline event handler XSS in label", async () => {
            const { PATCH } = await import("@/app/api/relationships/[id]/route");
            const req = mockReq(`http://localhost/api/relationships/${relationshipId}`, {
                label: '<img src=x onerror=alert(1)>safe',
            });
            const res = await PATCH(req as any, mockParams({ id: relationshipId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.label).toBe("safe");
        });

        it("sanitizes javascript: URI XSS in label", async () => {
            const { PATCH } = await import("@/app/api/relationships/[id]/route");
            const req = mockReq(`http://localhost/api/relationships/${relationshipId}`, {
                label: '<a href="javascript:alert(1)">click</a>',
            });
            const res = await PATCH(req as any, mockParams({ id: relationshipId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.label).toBe("click");
        });

        it("returns 404 for missing relationship", async () => {
            const { PATCH } = await import("@/app/api/relationships/[id]/route");
            const req = mockReq("http://localhost/api/relationships/bad", { type: "RELATED_TO" });
            const res = await PATCH(req as any, mockParams({ id: "bad" }));
            expect(res.status).toBe(404);
        });

        it("rejects invalid type", async () => {
            const { PATCH } = await import("@/app/api/relationships/[id]/route");
            const req = mockReq(`http://localhost/api/relationships/${relationshipId}`, {
                type: "INVALID_TYPE",
            });
            const res = await PATCH(req as any, mockParams({ id: relationshipId }));
            expect(res.status).toBe(400);
        });

        it("rejects empty update", async () => {
            const { PATCH } = await import("@/app/api/relationships/[id]/route");
            const req = mockReq(`http://localhost/api/relationships/${relationshipId}`, {});
            const res = await PATCH(req as any, mockParams({ id: relationshipId }));
            expect(res.status).toBe(400);
        });
    });

    describe("DELETE", () => {
        it("deletes a relationship", async () => {
            const { DELETE } = await import("@/app/api/relationships/[id]/route");
            const req = mockReq(`http://localhost/api/relationships/${relationshipId}`);
            const res = await DELETE(req as any, mockParams({ id: relationshipId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.success).toBe(true);
        });

        it("returns 404 for missing relationship", async () => {
            const { DELETE } = await import("@/app/api/relationships/[id]/route");
            const req = mockReq("http://localhost/api/relationships/bad");
            const res = await DELETE(req as any, mockParams({ id: "bad" }));
            expect(res.status).toBe(404);
        });
    });
});

describe("Relationships Route /api/projects/[id]/relationships with a linked universe", () => {
    let projectId: string;
    let objectId: string;
    let worldObjectId: string;

    beforeEach(async () => {
        const universe = await testPrisma.universe.create({ data: { title: "Test Universe" } });
        const project = await testPrisma.project.create({
            data: { title: "Test Project", universeId: universe.id },
        });
        projectId = project.id;

        const obj = await testPrisma.storyObject.create({
            data: { projectId, type: "CHARACTER", name: "Local Bob" },
        });
        objectId = obj.id;

        const worldObj = await testPrisma.worldObject.create({
            data: { universeId: universe.id, type: "CHARACTER", name: "Universe Alice" },
        });
        worldObjectId = worldObj.id;
    });

    async function post(body: unknown) {
        const { POST } = await import("@/app/api/projects/[id]/relationships/route");
        const req = mockReq(`http://localhost/api/projects/${projectId}/relationships`, body);
        return POST(req as any, mockParams({ id: projectId }));
    }

    it("links a local story object to a world object", async () => {
        const res = await post({ type: "RELATED_TO", fromObjectId: objectId, toObjectId: worldObjectId });
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.fromObject.name).toBe("Local Bob");
        expect(data.toWorldObject.name).toBe("Universe Alice");
        expect(data.toObjectId).toBeNull();
    });

    it("links a world object to a local story object", async () => {
        const res = await post({ type: "RELATED_TO", fromObjectId: worldObjectId, toObjectId: objectId });
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.fromWorldObject.name).toBe("Universe Alice");
        expect(data.toObject.name).toBe("Local Bob");
    });

    it("rejects a world object from a universe the project is not linked to", async () => {
        const otherUniverse = await testPrisma.universe.create({ data: { title: "Other" } });
        const stranger = await testPrisma.worldObject.create({
            data: { universeId: otherUniverse.id, type: "CHARACTER", name: "Stranger" },
        });
        const res = await post({ type: "RELATED_TO", fromObjectId: objectId, toObjectId: stranger.id });
        expect(res.status).toBe(404);
        expect((await res.json()).error).toBe("toObjectId not found in this project or linked universe");
    });

    it("lists the edge from the project and reads it back by id", async () => {
        const created = await (await post({ type: "RELATED_TO", fromObjectId: worldObjectId, toObjectId: objectId })).json();

        const { GET: list } = await import("@/app/api/projects/[id]/relationships/route");
        const listRes = await list(mockReq(`http://localhost/api/projects/${projectId}/relationships`) as any, mockParams({ id: projectId }));
        const { data } = await listRes.json();
        expect(data).toHaveLength(1);
        expect(data[0].fromWorldObject.name).toBe("Universe Alice");

        const { GET, PATCH } = await import("@/app/api/relationships/[id]/route");
        const getRes = await GET(mockReq(`http://localhost/api/relationships/${created.id}`) as any, mockParams({ id: created.id }));
        expect((await getRes.json()).fromWorldObject.name).toBe("Universe Alice");

        const patchRes = await PATCH(
            mockReq(`http://localhost/api/relationships/${created.id}`, { label: "rivals" }) as any,
            mockParams({ id: created.id })
        );
        expect((await patchRes.json()).fromWorldObject.name).toBe("Universe Alice");
    });
});
