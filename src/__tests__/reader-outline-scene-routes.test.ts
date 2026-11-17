import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import "./setup";

vi.mock("@/lib/api-auth", () => ({
    getCurrentUserId: vi.fn().mockReturnValue("user-1"),
    verifyProjectReadAccess: vi.fn(),
}));

import { verifyProjectReadAccess } from "@/lib/api-auth";
import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController } from "@/lib/controllers/structure";

describe("project-wide routes for a READER share (#1575)", () => {
    let projectId: string;

    beforeEach(async () => {
        const project = await ProjectsController.createProject({ title: "Shared" });
        projectId = project.id;
        vi.mocked(verifyProjectReadAccess).mockResolvedValue({
            authorized: true,
            project: { id: projectId, userId: "owner" },
            role: "READER",
        });
        const hidden = await StructureController.createNode({ projectId, type: "SCENE", title: "Hidden", status: "OUTLINE" });
        const drafted = await StructureController.createNode({ projectId, type: "SCENE", title: "Drafted", status: "DRAFT" });
        await StructureController.addAnnotation(hidden.id, "Hidden note");
        await StructureController.addAnnotation(drafted.id, "Visible note");
    });

    it("GET /api/timeline/:projectId leaves OUTLINE scenes out", async () => {
        const { GET } = await import("@/app/api/timeline/[projectId]/route");
        const res = await GET(new NextRequest("http://localhost"), { params: Promise.resolve({ projectId }) });

        const body = await res.json();
        expect(body.scenes.map((s: { title: string }) => s.title)).toEqual(["Drafted"]);
    });

    it("GET /api/annotations leaves OUTLINE-scene annotations out", async () => {
        const { GET } = await import("@/app/api/annotations/route");
        const res = await GET(new NextRequest(`http://localhost/api/annotations?projectId=${projectId}`));

        const body = await res.json();
        expect(body.map((a: { content: string }) => a.content)).toEqual(["Visible note"]);
    });
});
