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

describe("Content Route /api/nodes/[id]/content", () => {
    let projectId: string;
    let nodeId: string;

    beforeEach(async () => {
        const project = await testPrisma.project.create({
            data: { title: "Test Project" },
        });
        projectId = project.id;
        const node = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Test Scene", orderIndex: 0 },
        });
        nodeId = node.id;
    });

    describe("GET", () => {
        it("returns latest content and history", async () => {
            await testPrisma.contentVersion.create({
                data: { nodeId, content: "<p>Hello</p>", wordCount: 1 },
            });
            const { GET } = await import("@/app/api/nodes/[id]/content/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}/content`);
            const res = await GET(req as any, mockParams({ id: nodeId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.latest).toBeDefined();
            expect(data.history).toBeInstanceOf(Array);
        });

        it("returns specific version by versionId", async () => {
            const version = await testPrisma.contentVersion.create({
                data: { nodeId, content: "<p>Version 1</p>", wordCount: 2 },
            });
            const { GET } = await import("@/app/api/nodes/[id]/content/route");
            const req = mockReq(
                `http://localhost/api/nodes/${nodeId}/content?versionId=${version.id}`
            );
            const res = await GET(req as any, mockParams({ id: nodeId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.content).toBe("<p>Version 1</p>");
        });

        it("returns 404 for missing version", async () => {
            const { GET } = await import("@/app/api/nodes/[id]/content/route");
            const req = mockReq(
                `http://localhost/api/nodes/${nodeId}/content?versionId=nonexistent`
            );
            const res = await GET(req as any, mockParams({ id: nodeId }));
            expect(res.status).toBe(404);
        });
    });

    describe("POST", () => {
        it("creates a new content version", async () => {
            const { POST } = await import("@/app/api/nodes/[id]/content/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}/content`, {
                content: "<p>New content</p>",
            });
            const res = await POST(req as any, mockParams({ id: nodeId }));
            expect(res.status).toBe(201);
        });

        it("rejects missing content", async () => {
            const { POST } = await import("@/app/api/nodes/[id]/content/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}/content`, {});
            const res = await POST(req as any, mockParams({ id: nodeId }));
            expect(res.status).toBe(400);
        });
    });

    describe("PATCH", () => {
        it("restores a version", async () => {
            const v1 = await testPrisma.contentVersion.create({
                data: { nodeId, content: "<p>V1</p>", wordCount: 1 },
            });
            await testPrisma.contentVersion.create({
                data: { nodeId, content: "<p>V2</p>", wordCount: 1 },
            });
            const { PATCH } = await import("@/app/api/nodes/[id]/content/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}/content`, {
                versionId: v1.id,
            });
            const res = await PATCH(req as any, mockParams({ id: nodeId }));
            expect(res.status).toBe(201);
        });

        it("rejects missing versionId", async () => {
            const { PATCH } = await import("@/app/api/nodes/[id]/content/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}/content`, {});
            const res = await PATCH(req as any, mockParams({ id: nodeId }));
            expect(res.status).toBe(400);
        });
    });
});
