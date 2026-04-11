import { describe, it, expect, beforeEach, vi } from "vitest";
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

function mockReq(url: string, body?: unknown) {
    return new MockNextRequest(url, body ? { body: JSON.stringify(body) } : undefined);
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
            const res = await GET(req as any);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.projects).toBeInstanceOf(Array);
            expect(data.projects.length).toBeGreaterThanOrEqual(1);
        });

        it("POST creates a project", async () => {
            const { POST } = await import("@/app/api/projects/route");
            const req = mockReq("http://localhost/api/projects", {
                title: "New Project", author: "Author",
            });
            const res = await POST(req as any);
            expect(res.status).toBe(201);
            const data = await res.json();
            expect(data.title).toBe("New Project");
        });

        it("POST rejects empty title", async () => {
            const { POST } = await import("@/app/api/projects/route");
            const req = mockReq("http://localhost/api/projects", {
                title: "",
            });
            const res = await POST(req as any);
            expect(res.status).toBe(400);
        });

        it("GET includes projectLimit for authenticated users", async () => {
            const user = await testPrisma.user.create({
                data: { email: "limit@test.com", googleId: "g-limit-get", projectLimit: 2 },
            });
            const { GET } = await import("@/app/api/projects/route");
            const req = mockReq("http://localhost/api/projects");
            req.headers.set("x-user-id", user.id);
            const res = await GET(req as any);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.projectLimit).toBe(2);
        });

        it("GET does not include projectLimit for unauthenticated users", async () => {
            const { GET } = await import("@/app/api/projects/route");
            const req = mockReq("http://localhost/api/projects");
            const res = await GET(req as any);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.projectLimit).toBeNull();
        });

        it("POST enforces project limit for authenticated users", async () => {
            const user = await testPrisma.user.create({
                data: { email: "limited@test.com", googleId: "g-limited", projectLimit: 2 },
            });
            // Create 2 active projects for this user (at the limit)
            await testPrisma.project.createMany({
                data: [
                    { title: "Project 1", userId: user.id },
                    { title: "Project 2", userId: user.id },
                ],
            });
            const { POST } = await import("@/app/api/projects/route");
            const req = mockReq("http://localhost/api/projects", { title: "Project 3" });
            req.headers.set("x-user-id", user.id);
            const res = await POST(req as any);
            expect(res.status).toBe(403);
            const data = await res.json();
            expect(data.error).toContain("Project limit reached");
        });

        it("POST allows creation when archived projects exist but active count is below limit", async () => {
            const user = await testPrisma.user.create({
                data: { email: "archived@test.com", googleId: "g-archived", projectLimit: 2 },
            });
            // 1 active + 1 archived = only 1 active, under the limit of 2
            await testPrisma.project.createMany({
                data: [
                    { title: "Active Project", userId: user.id },
                    { title: "Archived Project", userId: user.id, archivedAt: new Date() },
                ],
            });
            const { POST } = await import("@/app/api/projects/route");
            const req = mockReq("http://localhost/api/projects", { title: "New Active Project" });
            req.headers.set("x-user-id", user.id);
            const res = await POST(req as any);
            expect(res.status).toBe(201);
        });

        it("POST has no limit for unauthenticated users", async () => {
            // No userId — limit not enforced
            const { POST } = await import("@/app/api/projects/route");
            const req = mockReq("http://localhost/api/projects", { title: "Unlimited Project" });
            const res = await POST(req as any);
            expect(res.status).toBe(201);
        });
    });

    describe("GET/PATCH/DELETE /api/projects/[id]", () => {
        it("GET returns a project", async () => {
            const { GET } = await import("@/app/api/projects/[id]/route");
            const req = mockReq(`http://localhost/api/projects/${projectId}`);
            const res = await GET(req as any, mockParams({ id: projectId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.title).toBe("Test Project");
        });

        it("GET returns 404 for missing project", async () => {
            const { GET } = await import("@/app/api/projects/[id]/route");
            const req = mockReq("http://localhost/api/projects/bad");
            const res = await GET(req as any, mockParams({ id: "bad" }));
            expect(res.status).toBe(404);
        });

        it("PATCH updates a project", async () => {
            const { PATCH } = await import("@/app/api/projects/[id]/route");
            const req = mockReq(`http://localhost/api/projects/${projectId}`, {
                title: "Updated Title",
            });
            const res = await PATCH(req as any, mockParams({ id: projectId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.title).toBe("Updated Title");
        });

        it("DELETE rejects non-archived project", async () => {
            const { DELETE } = await import("@/app/api/projects/[id]/route");
            const req = mockReq(`http://localhost/api/projects/${projectId}`, {
                confirmTitle: "Test Project",
            });
            const res = await DELETE(req as any, mockParams({ id: projectId }));
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
            const res = await DELETE(req as any, mockParams({ id: projectId }));
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
            const res = await GET(req as any, mockParams({ id: nodeId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.title).toBe("Test Scene");
            expect(data.latestContent).toBeDefined();
            expect(data.latestContent.content).toBe("Hello world");
        });

        it("GET returns 404 for missing node", async () => {
            const { GET } = await import("@/app/api/nodes/[id]/route");
            const req = mockReq("http://localhost/api/nodes/bad");
            const res = await GET(req as any, mockParams({ id: "bad" }));
            expect(res.status).toBe(404);
        });

        it("PATCH updates node title", async () => {
            const { PATCH } = await import("@/app/api/nodes/[id]/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}`, {
                title: "Updated Scene",
            });
            const res = await PATCH(req as any, mockParams({ id: nodeId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.title).toBe("Updated Scene");
        });

        it("PATCH rejects invalid status", async () => {
            const { PATCH } = await import("@/app/api/nodes/[id]/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}`, {
                status: "INVALID",
            });
            const res = await PATCH(req as any, mockParams({ id: nodeId }));
            expect(res.status).toBe(400);
        });

        it("DELETE removes node and reindexes", async () => {
            const { DELETE } = await import("@/app/api/nodes/[id]/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}`);
            const res = await DELETE(req as any, mockParams({ id: nodeId }));
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
            const res = await GET(req as any, mockParams({ id: objectId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.name).toBe("Alice");
        });

        it("GET returns 404 for missing object", async () => {
            const { GET } = await import("@/app/api/story-objects/[id]/route");
            const req = mockReq("http://localhost/api/story-objects/bad");
            const res = await GET(req as any, mockParams({ id: "bad" }));
            expect(res.status).toBe(404);
        });

        it("PATCH updates story object", async () => {
            const { PATCH } = await import("@/app/api/story-objects/[id]/route");
            const req = mockReq(`http://localhost/api/story-objects/${objectId}`, {
                name: "Bob",
            });
            const res = await PATCH(req as any, mockParams({ id: objectId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.name).toBe("Bob");
        });

        it("PATCH rejects empty name", async () => {
            const { PATCH } = await import("@/app/api/story-objects/[id]/route");
            const req = mockReq(`http://localhost/api/story-objects/${objectId}`, {
                name: "",
            });
            const res = await PATCH(req as any, mockParams({ id: objectId }));
            expect(res.status).toBe(400);
        });

        it("DELETE removes story object", async () => {
            const { DELETE } = await import("@/app/api/story-objects/[id]/route");
            const req = mockReq(`http://localhost/api/story-objects/${objectId}`);
            const res = await DELETE(req as any, mockParams({ id: objectId }));
            expect(res.status).toBe(200);
        });
    });
});
