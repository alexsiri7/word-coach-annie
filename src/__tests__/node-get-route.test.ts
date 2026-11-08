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

function mockParams<T>(params: T): { params: Promise<T> } {
    return { params: Promise.resolve(params) };
}

describe("GET /api/nodes/[id] by a READER share", () => {
    let nodeId: string;
    let readerId: string;
    const readerEmail = "reader@example.com";

    beforeEach(async () => {
        const owner = await testPrisma.user.create({
            data: { email: "owner@example.com", googleId: "google-owner", name: "Owner" },
        });
        const project = await testPrisma.project.create({
            data: { title: "Test Project", userId: owner.id },
        });
        const reader = await testPrisma.user.create({
            data: { email: readerEmail, googleId: "google-reader", name: "Reader" },
        });
        readerId = reader.id;
        await testPrisma.projectShare.create({
            data: { projectId: project.id, email: readerEmail, role: "READER" },
        });
        const node = await testPrisma.structureNode.create({
            data: { projectId: project.id, type: "SCENE", title: "Scene", orderIndex: 0 },
        });
        nodeId = node.id;
        await testPrisma.contentVersion.create({
            data: { nodeId, content: "<p>Scene text</p>", wordCount: 2 },
        });
    });

    async function getAsReader() {
        const req = new MockNextRequest(`http://localhost/api/nodes/${nodeId}`);
        req.headers.set("x-user-id", readerId);
        req.headers.set("x-user-email", readerEmail);
        const { GET } = await import("@/app/api/nodes/[id]/route");
        return GET(req as never, mockParams({ id: nodeId }));
    }

    it("refuses an outline scene", async () => {
        const res = await getAsReader();
        expect(res.status).toBe(403);
    });

    it("returns a drafted scene with its latest content", async () => {
        await testPrisma.structureNode.update({ where: { id: nodeId }, data: { status: "DRAFT" } });
        const res = await getAsReader();
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.latestContent.content).toBe("<p>Scene text</p>");
    });
});
