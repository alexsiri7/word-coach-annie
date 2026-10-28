import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { testPrisma } from "./setup";

// Mock next/server before importing route handlers
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

function mockReq(url: string, body?: unknown): NextRequest {
    return new MockNextRequest(url, body ? { body: JSON.stringify(body) } : undefined) as unknown as NextRequest;
}

function mockParams<T>(params: T): { params: Promise<T> } {
    return { params: Promise.resolve(params) };
}

describe("API Route Handlers", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await testPrisma.project.create({
            data: { title: "Test Project" },
        });
        projectId = project.id;
    });

    describe("GET/POST /api/projects", () => {
        it("GET lists projects", async () => {
            const { GET } = await import("@/app/api/projects/route");
            const req = mockReq("http://localhost/api/projects");
            const res = await GET(req);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.projects).toBeInstanceOf(Array);
            expect(data.projects.length).toBeGreaterThanOrEqual(1);
        });

        it("GET builds items from an explicit field list without the owner's userId", async () => {
            const owner = await testPrisma.user.create({
                data: { email: "owner@test.com", googleId: "g-owner" },
            });
            await testPrisma.project.update({ where: { id: projectId }, data: { userId: owner.id } });

            const { GET } = await import("@/app/api/projects/route");
            const res = await GET(mockReq("http://localhost/api/projects"));
            const data = await res.json();
            const item = data.projects.find((p: { id: string }) => p.id === projectId);
            expect(Object.keys(item).sort()).toEqual([
                "archivedAt", "author", "characterCount", "createdAt", "genre", "id", "isSample",
                "nodeCount", "projectType", "sceneCount", "synopsis", "title", "updatedAt", "wordCount",
            ]);
        });

        it("POST creates a project", async () => {
            const { POST } = await import("@/app/api/projects/route");
            const req = mockReq("http://localhost/api/projects", {
                title: "New Project", author: "Author",
            });
            const res = await POST(req);
            expect(res.status).toBe(201);
            const data = await res.json();
            expect(data.title).toBe("New Project");
        });

        it("POST rejects empty title", async () => {
            const { POST } = await import("@/app/api/projects/route");
            const req = mockReq("http://localhost/api/projects", {
                title: "",
            });
            const res = await POST(req);
            expect(res.status).toBe(400);
        });
    });

    describe("GET/PATCH/DELETE /api/projects/[id]", () => {
        it("GET returns a project", async () => {
            const { GET } = await import("@/app/api/projects/[id]/route");
            const req = mockReq(`http://localhost/api/projects/${projectId}`);
            const res = await GET(req, mockParams({ id: projectId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.title).toBe("Test Project");
        });

        it("GET returns 404 for missing project", async () => {
            const { GET } = await import("@/app/api/projects/[id]/route");
            const req = mockReq("http://localhost/api/projects/bad");
            const res = await GET(req, mockParams({ id: "bad" }));
            expect(res.status).toBe(404);
        });

        it("PATCH updates a project", async () => {
            const { PATCH } = await import("@/app/api/projects/[id]/route");
            const req = mockReq(`http://localhost/api/projects/${projectId}`, {
                title: "Updated Title",
            });
            const res = await PATCH(req, mockParams({ id: projectId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.title).toBe("Updated Title");
        });

        it("DELETE rejects non-archived project", async () => {
            const { DELETE } = await import("@/app/api/projects/[id]/route");
            const req = mockReq(`http://localhost/api/projects/${projectId}`, {
                confirmTitle: "Test Project",
            });
            const res = await DELETE(req, mockParams({ id: projectId }));
            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error).toContain("archived");
        });

        it("DELETE removes an archived project with confirmation", async () => {
            // Archive first
            await testPrisma.project.update({
                where: { id: projectId },
                data: { archivedAt: new Date() },
            });
            const { DELETE } = await import("@/app/api/projects/[id]/route");
            const req = mockReq(`http://localhost/api/projects/${projectId}`, {
                confirmTitle: "Test Project",
            });
            const res = await DELETE(req, mockParams({ id: projectId }));
            expect(res.status).toBe(200);
        });
    });

    describe("GET/PATCH/DELETE /api/nodes/[id]", () => {
        let nodeId: string;

        beforeEach(async () => {
            const node = await testPrisma.structureNode.create({
                data: { projectId, type: "SCENE", title: "Test Scene", orderIndex: 0 },
            });
            nodeId = node.id;
            await testPrisma.contentVersion.create({
                data: { nodeId, content: "Hello world", wordCount: 2 },
            });
        });

        it("GET returns node with latest content", async () => {
            const { GET } = await import("@/app/api/nodes/[id]/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}`);
            const res = await GET(req, mockParams({ id: nodeId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.title).toBe("Test Scene");
            expect(data.latestContent).toBeDefined();
            expect(data.latestContent.content).toBe("Hello world");
        });

        it("GET returns 404 for missing node", async () => {
            const { GET } = await import("@/app/api/nodes/[id]/route");
            const req = mockReq("http://localhost/api/nodes/bad");
            const res = await GET(req, mockParams({ id: "bad" }));
            expect(res.status).toBe(404);
        });

        it("PATCH updates node title", async () => {
            const { PATCH } = await import("@/app/api/nodes/[id]/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}`, {
                title: "Updated Scene",
            });
            const res = await PATCH(req, mockParams({ id: nodeId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.title).toBe("Updated Scene");
        });

        it("PATCH rejects invalid status", async () => {
            const { PATCH } = await import("@/app/api/nodes/[id]/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}`, {
                status: "INVALID",
            });
            const res = await PATCH(req, mockParams({ id: nodeId }));
            expect(res.status).toBe(400);
        });

        it("PATCH rejects re-parenting a chapter under its own scene", async () => {
            const chapter = await testPrisma.structureNode.create({
                data: { projectId, type: "CHAPTER", title: "Chapter", orderIndex: 1 },
            });
            await testPrisma.structureNode.update({ where: { id: nodeId }, data: { parentId: chapter.id } });

            const { PATCH } = await import("@/app/api/nodes/[id]/route");
            const req = mockReq(`http://localhost/api/nodes/${chapter.id}`, { parentId: nodeId });
            const res = await PATCH(req, mockParams({ id: chapter.id }));
            expect(res.status).toBe(400);
            const after = await testPrisma.structureNode.findUnique({ where: { id: chapter.id } });
            expect(after?.parentId).toBeNull();
        });

        it("PATCH rejects a negative orderIndex", async () => {
            const { PATCH } = await import("@/app/api/nodes/[id]/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}`, { orderIndex: -1 });
            const res = await PATCH(req, mockParams({ id: nodeId }));
            expect(res.status).toBe(400);
        });

        it("PATCH lets only one of two concurrent cross re-parents through", async () => {
            const a = await testPrisma.structureNode.create({ data: { projectId, type: "CHAPTER", title: "A", orderIndex: 1 } });
            const b = await testPrisma.structureNode.create({ data: { projectId, type: "CHAPTER", title: "B", orderIndex: 2 } });

            const { PATCH } = await import("@/app/api/nodes/[id]/route");
            const responses = await Promise.all([
                PATCH(mockReq(`http://localhost/api/nodes/${a.id}`, { parentId: b.id }), mockParams({ id: a.id })),
                PATCH(mockReq(`http://localhost/api/nodes/${b.id}`, { parentId: a.id }), mockParams({ id: b.id })),
            ]);
            expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
        });

        it("PATCH bounds orderIndex at 10,000", async () => {
            const { PATCH } = await import("@/app/api/nodes/[id]/route");
            const atMax = await PATCH(mockReq(`http://localhost/api/nodes/${nodeId}`, { orderIndex: 10_000 }), mockParams({ id: nodeId }));
            expect(atMax.status).toBe(200);
            const overMax = await PATCH(mockReq(`http://localhost/api/nodes/${nodeId}`, { orderIndex: 10_001 }), mockParams({ id: nodeId }));
            expect(overMax.status).toBe(400);
        });

        it("move re-parents a scene under a chapter", async () => {
            const chapter = await testPrisma.structureNode.create({
                data: { projectId, type: "CHAPTER", title: "Chapter", orderIndex: 1 },
            });

            const { POST } = await import("@/app/api/nodes/move/route");
            const res = await POST(mockReq("http://localhost/api/nodes/move", { nodeId, newParentId: chapter.id, newIndex: 0 }));
            expect(res.status).toBe(200);
            const after = await testPrisma.structureNode.findUnique({ where: { id: nodeId } });
            expect(after?.parentId).toBe(chapter.id);
        });

        it("move rejects re-parenting a chapter under its own scene", async () => {
            const chapter = await testPrisma.structureNode.create({
                data: { projectId, type: "CHAPTER", title: "Chapter", orderIndex: 1 },
            });
            await testPrisma.structureNode.update({ where: { id: nodeId }, data: { parentId: chapter.id } });

            const { POST } = await import("@/app/api/nodes/move/route");
            const res = await POST(mockReq("http://localhost/api/nodes/move", { nodeId: chapter.id, newParentId: nodeId, newIndex: 0 }));
            expect(res.status).toBe(400);
            const after = await testPrisma.structureNode.findUnique({ where: { id: chapter.id } });
            expect(after?.parentId).toBeNull();
        });

        it("move lets only one of two concurrent cross re-parents through", async () => {
            const a = await testPrisma.structureNode.create({ data: { projectId, type: "CHAPTER", title: "A", orderIndex: 1 } });
            const b = await testPrisma.structureNode.create({ data: { projectId, type: "CHAPTER", title: "B", orderIndex: 2 } });

            const { POST } = await import("@/app/api/nodes/move/route");
            const responses = await Promise.all([
                POST(mockReq("http://localhost/api/nodes/move", { nodeId: a.id, newParentId: b.id, newIndex: 0 })),
                POST(mockReq("http://localhost/api/nodes/move", { nodeId: b.id, newParentId: a.id, newIndex: 0 })),
            ]);
            expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
        });

        it("DELETE removes node and reindexes", async () => {
            const { DELETE } = await import("@/app/api/nodes/[id]/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}`);
            const res = await DELETE(req, mockParams({ id: nodeId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.success).toBe(true);
        });
    });

    describe("GET/PATCH/DELETE /api/story-objects/[id]", () => {
        let objectId: string;

        beforeEach(async () => {
            const obj = await testPrisma.storyObject.create({
                data: { projectId, type: "CHARACTER", name: "Alice" },
            });
            objectId = obj.id;
        });

        it("GET returns story object with relationships", async () => {
            const { GET } = await import("@/app/api/story-objects/[id]/route");
            const req = mockReq(`http://localhost/api/story-objects/${objectId}`);
            const res = await GET(req, mockParams({ id: objectId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.name).toBe("Alice");
        });

        it("GET returns 404 for missing object", async () => {
            const { GET } = await import("@/app/api/story-objects/[id]/route");
            const req = mockReq("http://localhost/api/story-objects/bad");
            const res = await GET(req, mockParams({ id: "bad" }));
            expect(res.status).toBe(404);
        });

        it("PATCH updates story object", async () => {
            const { PATCH } = await import("@/app/api/story-objects/[id]/route");
            const req = mockReq(`http://localhost/api/story-objects/${objectId}`, {
                name: "Bob",
            });
            const res = await PATCH(req, mockParams({ id: objectId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.name).toBe("Bob");
        });

        it("PATCH rejects empty name", async () => {
            const { PATCH } = await import("@/app/api/story-objects/[id]/route");
            const req = mockReq(`http://localhost/api/story-objects/${objectId}`, {
                name: "",
            });
            const res = await PATCH(req, mockParams({ id: objectId }));
            expect(res.status).toBe(400);
        });

        it("DELETE removes story object", async () => {
            const { DELETE } = await import("@/app/api/story-objects/[id]/route");
            const req = mockReq(`http://localhost/api/story-objects/${objectId}`);
            const res = await DELETE(req, mockParams({ id: objectId }));
            expect(res.status).toBe(200);
        });
    });
});
