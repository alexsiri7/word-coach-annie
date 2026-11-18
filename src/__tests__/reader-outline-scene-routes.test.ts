import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ReactElement } from "react";
import "./setup";

vi.mock("@/lib/api-auth", () => ({
    getCurrentUserId: vi.fn().mockReturnValue("user-1"),
    verifyProjectReadAccess: vi.fn(),
}));

vi.mock("next/headers", () => ({
    headers: vi.fn().mockResolvedValue(new Headers({ "x-user-id": "user-1", "x-user-email": "reader@example.com" })),
}));

vi.mock("next/navigation", () => ({
    notFound: vi.fn(() => {
        throw new Error("NEXT_NOT_FOUND");
    }),
}));

import { verifyProjectReadAccess } from "@/lib/api-auth";
import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController } from "@/lib/controllers/structure";
import type { TimelineData } from "@/lib/controllers/timeline";

async function renderTimelinePage(projectId: string): Promise<TimelineData> {
    const { default: TimelinePage } = await import("@/app/project/[id]/timeline/page");
    const page = (await TimelinePage({ params: Promise.resolve({ id: projectId }) })) as ReactElement<{
        children: ReactElement<{ initialData: TimelineData }>;
    }>;
    return page.props.children.props.initialData;
}

describe("project-wide scene views and OUTLINE scenes (#1575)", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await ProjectsController.createProject({ title: "Shared" });
        projectId = project.id;
        const hidden = await StructureController.createNode({ projectId, type: "SCENE", title: "Hidden", status: "OUTLINE" });
        const drafted = await StructureController.createNode({ projectId, type: "SCENE", title: "Drafted", status: "DRAFT" });
        await StructureController.addAnnotation(hidden.id, "Hidden note");
        await StructureController.addAnnotation(drafted.id, "Visible note");
    });

    describe.each([
        { role: "READER" as const, scenes: ["Drafted"], notes: ["Visible note"] },
        { role: "EDITOR" as const, scenes: ["Hidden", "Drafted"], notes: ["Hidden note", "Visible note"] },
        { role: "OWNER" as const, scenes: ["Hidden", "Drafted"], notes: ["Hidden note", "Visible note"] },
        { role: null, scenes: ["Hidden", "Drafted"], notes: ["Hidden note", "Visible note"] },
    ])("for role $role", ({ role, scenes, notes }) => {
        beforeEach(() => {
            vi.mocked(verifyProjectReadAccess).mockResolvedValue({
                authorized: true,
                project: { id: projectId, userId: "owner" },
                role,
            });
        });

        it("GET /api/timeline/:projectId", async () => {
            const { GET } = await import("@/app/api/timeline/[projectId]/route");
            const res = await GET(new NextRequest("http://localhost"), { params: Promise.resolve({ projectId }) });

            const body = await res.json();
            expect(body.scenes.map((s: { title: string }) => s.title)).toEqual(scenes);
        });

        it("the timeline page", async () => {
            const data = await renderTimelinePage(projectId);

            expect(data.scenes.map((s) => s.title)).toEqual(scenes);
        });

        it("GET /api/annotations", async () => {
            const { GET } = await import("@/app/api/annotations/route");
            const res = await GET(new NextRequest(`http://localhost/api/annotations?projectId=${projectId}`));

            const body = await res.json();
            expect(body.map((a: { content: string }) => a.content).sort()).toEqual(notes);
        });
    });

    it("the timeline page is not found for a caller without project access", async () => {
        const { NextResponse } = await import("next/server");
        vi.mocked(verifyProjectReadAccess).mockResolvedValue({
            authorized: false,
            response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        });

        await expect(renderTimelinePage(projectId)).rejects.toThrow("NEXT_NOT_FOUND");
    });
});
