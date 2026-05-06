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

// Auth is mocked to grant access — the test isolates the entry-level IDOR guard
// (entry-belongs-to-world-object), not the universe-level access check.
vi.mock("@/lib/api-auth", () => ({
    getCurrentUserId: vi.fn().mockReturnValue(null),
    verifyUniverseAccess: vi.fn().mockResolvedValue({ authorized: true, universe: { id: "u", userId: null } }),
}));

function mockReq(url: string, body?: unknown) {
    return new MockNextRequest(url, body ? { body: JSON.stringify(body) } : undefined);
}

function mockParams<T>(params: T): { params: Promise<T> } {
    return { params: Promise.resolve(params) };
}

describe("PATCH/DELETE /api/world-objects/[id]/timeline/[entryId]", () => {
    let universeId: string;
    let wo1Id: string;
    let wo2Id: string;
    let foreignEntryId: string;
    let ownEntryId: string;

    beforeEach(async () => {
        const u = await testPrisma.universe.create({ data: { title: "U" } });
        universeId = u.id;
        const wo1 = await testPrisma.worldObject.create({
            data: { universeId, type: "CHARACTER", name: "A" },
        });
        wo1Id = wo1.id;
        const wo2 = await testPrisma.worldObject.create({
            data: { universeId, type: "CHARACTER", name: "B" },
        });
        wo2Id = wo2.id;
        const own = await testPrisma.worldObjectTimelineEntry.create({
            data: { worldObjectId: wo1Id, label: "Mine", orderIndex: 0 },
        });
        ownEntryId = own.id;
        const foreign = await testPrisma.worldObjectTimelineEntry.create({
            data: { worldObjectId: wo2Id, label: "Theirs", orderIndex: 0 },
        });
        foreignEntryId = foreign.id;
    });

    it("PATCH returns 404 when entryId belongs to a different world object (IDOR)", async () => {
        const { PATCH } = await import(
            "@/app/api/world-objects/[id]/timeline/[entryId]/route"
        );
        const req = mockReq(`http://localhost/x`, { label: "Hijacked" });
        const res = await PATCH(req as any, mockParams({ id: wo1Id, entryId: foreignEntryId }));
        expect(res.status).toBe(404);

        // The foreign entry's parent + label must be unchanged
        const after = await testPrisma.worldObjectTimelineEntry.findUnique({
            where: { id: foreignEntryId },
        });
        expect(after?.worldObjectId).toBe(wo2Id);
        expect(after?.label).toBe("Theirs");
    });

    it("PATCH succeeds when the entry belongs to the world object", async () => {
        const { PATCH } = await import(
            "@/app/api/world-objects/[id]/timeline/[entryId]/route"
        );
        const req = mockReq(`http://localhost/x`, { label: "Renamed" });
        const res = await PATCH(req as any, mockParams({ id: wo1Id, entryId: ownEntryId }));
        expect(res.status).toBe(200);

        const after = await testPrisma.worldObjectTimelineEntry.findUnique({
            where: { id: ownEntryId },
        });
        expect(after?.label).toBe("Renamed");
    });

    it("DELETE returns 404 when entryId belongs to a different world object (IDOR)", async () => {
        const { DELETE } = await import(
            "@/app/api/world-objects/[id]/timeline/[entryId]/route"
        );
        const req = mockReq(`http://localhost/x`);
        const res = await DELETE(req as any, mockParams({ id: wo1Id, entryId: foreignEntryId }));
        expect(res.status).toBe(404);

        // The foreign entry must still exist
        const after = await testPrisma.worldObjectTimelineEntry.findUnique({
            where: { id: foreignEntryId },
        });
        expect(after).not.toBeNull();
    });

    it("DELETE succeeds when the entry belongs to the world object", async () => {
        const { DELETE } = await import(
            "@/app/api/world-objects/[id]/timeline/[entryId]/route"
        );
        const req = mockReq(`http://localhost/x`);
        const res = await DELETE(req as any, mockParams({ id: wo1Id, entryId: ownEntryId }));
        expect(res.status).toBe(200);

        const after = await testPrisma.worldObjectTimelineEntry.findUnique({
            where: { id: ownEntryId },
        });
        expect(after).toBeNull();
    });
});
