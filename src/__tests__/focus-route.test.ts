import { describe, it, expect, beforeEach, vi } from "vitest";
import "./setup";

vi.mock("next/server", () => {
    const nr = class {
        body: string;
        status: number;
        constructor(body: string, init?: { status: number }) {
            this.body = body;
            this.status = init?.status || 200;
        }
        static json(data: unknown, init?: { status?: number }) {
            return { data, status: init?.status || 200, async json() { return data; } };
        }
    };
    return { NextResponse: nr, NextRequest: class {} };
});

vi.mock("@/lib/api-auth", () => ({
    getCurrentUserId: vi.fn().mockReturnValue(null),
    verifyProjectAccessByNode: vi.fn().mockResolvedValue({ authorized: true, projectId: "test" }),
    verifyProjectReadAccessByNode: vi.fn().mockResolvedValue({ authorized: true, projectId: "test", role: null }),
}));

function mockParams<T>(params: T): { params: Promise<T> } {
    return { params: Promise.resolve(params) };
}

import { verifyProjectReadAccessByNode } from "@/lib/api-auth";
import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController } from "@/lib/controllers/structure";

describe("Focus API route", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await ProjectsController.createProject({ title: "Test" });
        projectId = project.id;
    });

    it("GET returns scene context, related elements, and annotations", async () => {
        const ch = await StructureController.createNode({ projectId, type: "CHAPTER", title: "Ch 1" });
        const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "S1", parentId: ch.id });

        const { GET } = await import("@/app/api/focus/[sceneId]/route");
        const res = await GET(new Request("http://localhost") as any, mockParams({ sceneId: scene.id }));

        expect((res as any).status || 200).toBe(200);
        const body = await (res as any).json();
        expect(body.context).toBeDefined();
        expect(body.related).toBeDefined();
        expect(body.annotations).toBeDefined();
        expect(body.timelineScenes).toBeDefined();
        expect(Array.isArray(body.timelineScenes)).toBe(true);
        expect(body.timelineScenes.length).toBeGreaterThan(0);
        expect(body.timelineScenes[0]).toMatchObject({
            id: expect.any(String),
            title: expect.any(String),
            status: expect.any(String),
            orderIndex: expect.any(Number),
        });
    });

    describe("for a READER share", () => {
        beforeEach(() => {
            vi.mocked(verifyProjectReadAccessByNode).mockResolvedValueOnce({ authorized: true, projectId, role: "READER" });
        });

        it("refuses an OUTLINE scene", async () => {
            const scene = await StructureController.createNode({ projectId, type: "SCENE", title: "Hidden", status: "OUTLINE" });

            const { GET } = await import("@/app/api/focus/[sceneId]/route");
            const res = await GET(new Request("http://localhost") as any, mockParams({ sceneId: scene.id }));

            expect((res as any).status).toBe(403);
        });

        it("leaves OUTLINE scenes out of the neighbours and timeline of a visible scene", async () => {
            const first = await StructureController.createNode({ projectId, type: "SCENE", title: "First", status: "DRAFT" });
            await StructureController.createNode({ projectId, type: "SCENE", title: "Hidden", status: "OUTLINE" });
            const last = await StructureController.createNode({ projectId, type: "SCENE", title: "Last", status: "FINAL" });

            const { GET } = await import("@/app/api/focus/[sceneId]/route");
            const res = await GET(new Request("http://localhost") as any, mockParams({ sceneId: first.id }));

            expect((res as any).status).toBe(200);
            const body = await (res as any).json();
            expect(body.timelineScenes.map((s: { title: string }) => s.title)).toEqual(["First", "Last"]);
            expect(body.context.nextScene).toEqual({ id: last.id, title: "Last" });
        });
    });

    it.each(["OWNER", "EDITOR", null] as const)("keeps OUTLINE scenes for role %s", async (role) => {
        vi.mocked(verifyProjectReadAccessByNode).mockResolvedValueOnce({ authorized: true, projectId, role });
        const first = await StructureController.createNode({ projectId, type: "SCENE", title: "First", status: "DRAFT" });
        const hidden = await StructureController.createNode({ projectId, type: "SCENE", title: "Hidden", status: "OUTLINE" });

        const { GET } = await import("@/app/api/focus/[sceneId]/route");
        const res = await GET(new Request("http://localhost") as any, mockParams({ sceneId: first.id }));

        expect((res as any).status).toBe(200);
        const body = await (res as any).json();
        expect(body.timelineScenes.map((s: { title: string }) => s.title)).toEqual(["First", "Hidden"]);
        expect(body.context.nextScene).toEqual({ id: hidden.id, title: "Hidden" });
    });

    it("GET returns 500 for non-existent scene", async () => {
        const { GET } = await import("@/app/api/focus/[sceneId]/route");
        const res = await GET(new Request("http://localhost") as any, mockParams({ sceneId: "nonexistent" }));

        expect((res as any).status).toBe(500);
    });
});
