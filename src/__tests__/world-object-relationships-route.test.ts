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

vi.mock("@/lib/api-auth", () => ({
    getCurrentUserId: vi.fn().mockReturnValue(null),
    verifyUniverseAccess: vi.fn().mockResolvedValue({ authorized: true, universe: { id: "test", userId: null } }),
}));

function mockReq(url: string, body?: unknown) {
    return new MockNextRequest(url, body ? { body: JSON.stringify(body) } : undefined);
}

function mockParams<T>(params: T): { params: Promise<T> } {
    return { params: Promise.resolve(params) };
}

describe("World Object Relationships Route /api/world-objects/[id]/relationships", () => {
    let universeId: string;
    let worldObjectId: string;
    let targetWorldObjectId: string;

    beforeEach(async () => {
        const universe = await testPrisma.universe.create({
            data: { title: "Test Universe" },
        });
        universeId = universe.id;

        const wo1 = await testPrisma.worldObject.create({
            data: { universeId, type: "CHARACTER", name: "Marcus" },
        });
        worldObjectId = wo1.id;

        const wo2 = await testPrisma.worldObject.create({
            data: { universeId, type: "LOCATION", name: "The Mill" },
        });
        targetWorldObjectId = wo2.id;
    });

    describe("POST", () => {
        it("creates a relationship between world objects", async () => {
            const { POST } = await import("@/app/api/world-objects/[id]/relationships/route");
            const req = mockReq(`http://localhost/api/world-objects/${worldObjectId}/relationships`, {
                type: "LOCATED_AT",
                toWorldObjectId: targetWorldObjectId,
            });
            const res = await POST(req as any, mockParams({ id: worldObjectId }));
            expect(res.status).toBe(201);
            const data = await res.json();
            expect(data.type).toBe("LOCATED_AT");
            expect(data.fromWorldObject).toBeDefined();
            expect(data.toWorldObject).toBeDefined();
        });

        it("creates a relationship with a label", async () => {
            const { POST } = await import("@/app/api/world-objects/[id]/relationships/route");
            const req = mockReq(`http://localhost/api/world-objects/${worldObjectId}/relationships`, {
                type: "INTERACTS_WITH",
                toWorldObjectId: targetWorldObjectId,
                label: "works at",
            });
            const res = await POST(req as any, mockParams({ id: worldObjectId }));
            expect(res.status).toBe(201);
            const data = await res.json();
            expect(data.label).toBe("works at");
        });

        it("rejects missing type", async () => {
            const { POST } = await import("@/app/api/world-objects/[id]/relationships/route");
            const req = mockReq(`http://localhost/api/world-objects/${worldObjectId}/relationships`, {
                toWorldObjectId: targetWorldObjectId,
            });
            const res = await POST(req as any, mockParams({ id: worldObjectId }));
            expect(res.status).toBe(400);
        });

        it("rejects invalid type", async () => {
            const { POST } = await import("@/app/api/world-objects/[id]/relationships/route");
            const req = mockReq(`http://localhost/api/world-objects/${worldObjectId}/relationships`, {
                type: "INVALID_TYPE",
                toWorldObjectId: targetWorldObjectId,
            });
            const res = await POST(req as any, mockParams({ id: worldObjectId }));
            expect(res.status).toBe(400);
        });

        it("rejects missing toWorldObjectId", async () => {
            const { POST } = await import("@/app/api/world-objects/[id]/relationships/route");
            const req = mockReq(`http://localhost/api/world-objects/${worldObjectId}/relationships`, {
                type: "RELATED_TO",
            });
            const res = await POST(req as any, mockParams({ id: worldObjectId }));
            expect(res.status).toBe(400);
        });

        it("rejects self-relationship", async () => {
            const { POST } = await import("@/app/api/world-objects/[id]/relationships/route");
            const req = mockReq(`http://localhost/api/world-objects/${worldObjectId}/relationships`, {
                type: "RELATED_TO",
                toWorldObjectId: worldObjectId,
            });
            const res = await POST(req as any, mockParams({ id: worldObjectId }));
            expect(res.status).toBe(400);
        });

        it("rejects non-existent target", async () => {
            const { POST } = await import("@/app/api/world-objects/[id]/relationships/route");
            const req = mockReq(`http://localhost/api/world-objects/${worldObjectId}/relationships`, {
                type: "RELATED_TO",
                toWorldObjectId: "nonexistent",
            });
            const res = await POST(req as any, mockParams({ id: worldObjectId }));
            expect(res.status).toBe(404);
        });

        it("rejects target from different universe", async () => {
            const otherUniverse = await testPrisma.universe.create({
                data: { title: "Other Universe" },
            });
            const otherWo = await testPrisma.worldObject.create({
                data: { universeId: otherUniverse.id, type: "CHARACTER", name: "Stranger" },
            });

            const { POST } = await import("@/app/api/world-objects/[id]/relationships/route");
            const req = mockReq(`http://localhost/api/world-objects/${worldObjectId}/relationships`, {
                type: "RELATED_TO",
                toWorldObjectId: otherWo.id,
            });
            const res = await POST(req as any, mockParams({ id: worldObjectId }));
            expect(res.status).toBe(400);
        });
    });
});
