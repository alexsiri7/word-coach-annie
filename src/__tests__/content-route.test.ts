import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./setup";
import { computeContentHash } from "@/mcp/content-hash";

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
            expect(data.latest.contentHash).toBe(computeContentHash("<p>Hello</p>"));
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

    describe("GET by a project share", () => {
        let versionId: string;

        beforeEach(async () => {
            const owner = await testPrisma.user.create({
                data: { email: "owner@example.com", googleId: "google-owner", name: "Owner" },
            });
            await testPrisma.project.update({ where: { id: projectId }, data: { userId: owner.id } });
            await testPrisma.contentVersion.create({
                data: { nodeId, content: "<p>Abandoned draft</p>", wordCount: 2 },
            });
            const latest = await testPrisma.contentVersion.create({
                data: { nodeId, content: "<p>Current text</p>", wordCount: 2 },
            });
            versionId = latest.id;
        });

        async function shareAs(role: "READER" | "EDITOR") {
            const email = `${role.toLowerCase()}@example.com`;
            const user = await testPrisma.user.create({
                data: { email, googleId: `google-${role}`, name: role },
            });
            await testPrisma.projectShare.create({ data: { projectId, email, role } });
            return (url: string) => {
                const req = mockReq(url);
                req.headers.set("x-user-id", user.id);
                req.headers.set("x-user-email", email);
                return req;
            };
        }

        async function setStatus(status: string) {
            await testPrisma.structureNode.update({ where: { id: nodeId }, data: { status } });
        }

        it("gives a READER the current text of a drafted scene without history", async () => {
            await setStatus("DRAFT");
            const req = (await shareAs("READER"))(`http://localhost/api/nodes/${nodeId}/content`);
            const { GET } = await import("@/app/api/nodes/[id]/content/route");
            const res = await GET(req as never, mockParams({ id: nodeId }));
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.latest.content).toBe("<p>Current text</p>");
            expect(data.history).toEqual([]);
        });

        it("refuses a READER a version by id", async () => {
            await setStatus("DRAFT");
            const req = (await shareAs("READER"))(
                `http://localhost/api/nodes/${nodeId}/content?versionId=${versionId}`
            );
            const { GET } = await import("@/app/api/nodes/[id]/content/route");
            const res = await GET(req as never, mockParams({ id: nodeId }));
            expect(res.status).toBe(403);
        });

        it("refuses a READER an outline scene", async () => {
            const req = (await shareAs("READER"))(`http://localhost/api/nodes/${nodeId}/content`);
            const { GET } = await import("@/app/api/nodes/[id]/content/route");
            const res = await GET(req as never, mockParams({ id: nodeId }));
            expect(res.status).toBe(403);
        });

        it("still gives an EDITOR the history and any version of an outline scene", async () => {
            const asEditor = await shareAs("EDITOR");
            const { GET } = await import("@/app/api/nodes/[id]/content/route");
            const res = await GET(
                asEditor(`http://localhost/api/nodes/${nodeId}/content`) as never,
                mockParams({ id: nodeId })
            );
            expect(res.status).toBe(200);
            expect((await res.json()).history).toHaveLength(2);
            const versionRes = await GET(
                asEditor(`http://localhost/api/nodes/${nodeId}/content?versionId=${versionId}`) as never,
                mockParams({ id: nodeId })
            );
            expect(versionRes.status).toBe(200);
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
            const stored = await testPrisma.contentVersion.findFirstOrThrow({ where: { nodeId } });
            const data = await res.json();
            expect(data.contentHash).toBe(computeContentHash(stored.content));
        });

        it("returns 409 when contentHash is omitted and a version already exists", async () => {
            await testPrisma.contentVersion.create({
                data: { nodeId, content: "<p>Written by Annie</p>", wordCount: 3 },
            });
            const { POST } = await import("@/app/api/nodes/[id]/content/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}/content`, {
                content: "<p>Stale editor content</p>",
            });
            const res = await POST(req as any, mockParams({ id: nodeId }));
            expect(res.status).toBe(409);
            const data = await res.json();
            expect(data.conflict).toBe(true);
            expect(data.content).toBe("<p>Written by Annie</p>");
            expect(data.contentHash).toBe(computeContentHash("<p>Written by Annie</p>"));
            expect(await testPrisma.contentVersion.count({ where: { nodeId } })).toBe(1);
        });

        it("accepts a missing contentHash when the latest version is empty", async () => {
            await testPrisma.contentVersion.create({
                data: { nodeId, content: "", wordCount: 0 },
            });
            const { POST } = await import("@/app/api/nodes/[id]/content/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}/content`, {
                content: "<p>First words</p>",
            });
            const res = await POST(req as any, mockParams({ id: nodeId }));
            expect(res.status).toBe(201);
        });

        it("returns 409 when contentHash is null and a version already exists", async () => {
            await testPrisma.contentVersion.create({
                data: { nodeId, content: "<p>Written by Annie</p>", wordCount: 3 },
            });
            const { POST } = await import("@/app/api/nodes/[id]/content/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}/content`, {
                content: "<p>Stale editor content</p>",
                contentHash: null,
            });
            const res = await POST(req as any, mockParams({ id: nodeId }));
            expect(res.status).toBe(409);
        });

        it("rejects missing content", async () => {
            const { POST } = await import("@/app/api/nodes/[id]/content/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}/content`, {});
            const res = await POST(req as any, mockParams({ id: nodeId }));
            expect(res.status).toBe(400);
        });

        it("returns 409 when contentHash does not match latest version", async () => {
            await testPrisma.contentVersion.create({
                data: { nodeId, content: "<p>Server content</p>", wordCount: 2 },
            });
            const staleHash = "0000000000000000000000000000000000000000000000000000000000000000";
            const { POST } = await import("@/app/api/nodes/[id]/content/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}/content`, {
                content: "<p>Client content</p>",
                contentHash: staleHash,
            });
            const res = await POST(req as any, mockParams({ id: nodeId }));
            expect(res.status).toBe(409);
            const data = await res.json();
            expect(data.conflict).toBe(true);
            expect(data.content).toBe("<p>Server content</p>");
        });

        it("returns 201 when contentHash matches latest version", async () => {
            await testPrisma.contentVersion.create({
                data: { nodeId, content: "<p>Server content</p>", wordCount: 2 },
            });
            const correctHash = computeContentHash("<p>Server content</p>");
            const { POST } = await import("@/app/api/nodes/[id]/content/route");
            const req = mockReq(`http://localhost/api/nodes/${nodeId}/content`, {
                content: "<p>Updated content</p>",
                contentHash: correctHash,
            });
            const res = await POST(req as any, mockParams({ id: nodeId }));
            expect(res.status).toBe(201);
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
