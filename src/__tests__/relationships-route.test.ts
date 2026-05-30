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
