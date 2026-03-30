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
}));

function mockParams<T>(params: T): { params: Promise<T> } {
    return { params: Promise.resolve(params) };
}

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
    });

    it("GET returns 500 for non-existent scene", async () => {
        const { GET } = await import("@/app/api/focus/[sceneId]/route");
        const res = await GET(new Request("http://localhost") as any, mockParams({ sceneId: "nonexistent" }));

        expect((res as any).status).toBe(500);
    });
});
