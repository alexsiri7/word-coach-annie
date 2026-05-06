import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/api-auth", () => ({
    getCurrentUserId: vi.fn().mockReturnValue(null),
    verifyProjectReadAccess: vi.fn(),
}));

vi.mock("@/lib/controllers/structure", () => ({
    StructureController: {
        getOpenAnnotations: vi.fn().mockResolvedValue([]),
    },
}));

import { verifyProjectReadAccess } from "@/lib/api-auth";
import { StructureController } from "@/lib/controllers/structure";

function makeReq(url: string) {
    return new Request(url) as any;
}
// The route reads request.nextUrl.searchParams; the runtime NextRequest has it,
// but for unit tests we forward .nextUrl from the URL.
function mockNextReq(query: string) {
    const req = makeReq(`http://localhost/api/annotations${query}`);
    (req as any).nextUrl = new URL(`http://localhost/api/annotations${query}`);
    return req;
}

describe("GET /api/annotations", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(StructureController.getOpenAnnotations).mockResolvedValue([] as any);
    });

    it("returns 400 when projectId is missing (CRIT-01 contract)", async () => {
        const { GET } = await import("@/app/api/annotations/route");
        const res = await GET(mockNextReq(""));
        expect(res.status).toBe(400);
        const body = await (res as any).json();
        expect(body.error).toContain("projectId");
        expect(StructureController.getOpenAnnotations).not.toHaveBeenCalled();
    });

    it("delegates to verifyProjectReadAccess and returns the access response when not authorized", async () => {
        vi.mocked(verifyProjectReadAccess).mockResolvedValue({
            authorized: false,
            response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        } as any);

        const { GET } = await import("@/app/api/annotations/route");
        const res = await GET(mockNextReq("?projectId=p-foreign"));
        expect(res.status).toBe(403);
        expect(StructureController.getOpenAnnotations).not.toHaveBeenCalled();
    });

    it("returns annotations for an authorized projectId", async () => {
        vi.mocked(verifyProjectReadAccess).mockResolvedValue({
            authorized: true,
            project: { id: "p-1", userId: "u-1" },
        } as any);
        vi.mocked(StructureController.getOpenAnnotations).mockResolvedValue([
            { id: "a-1", content: "note", nodeId: "n-1" },
        ] as any);

        const { GET } = await import("@/app/api/annotations/route");
        const res = await GET(mockNextReq("?projectId=p-1"));
        expect(res.status).toBe(200);
        const body = await (res as any).json();
        expect(Array.isArray(body)).toBe(true);
        expect(body[0].id).toBe("a-1");
        expect(StructureController.getOpenAnnotations).toHaveBeenCalledWith("p-1");
    });
});
