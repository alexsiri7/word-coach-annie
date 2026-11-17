import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./setup";

class MockNextRequest {
    private _body: unknown;
    headers: Map<string, string>;

    constructor(init: { body: unknown; headers: Record<string, string> }) {
        this._body = init.body;
        this.headers = new Map(Object.entries(init.headers));
    }

    async json() {
        return this._body;
    }
}

vi.mock("next/server", () => {
    class MockNextResponse {
        status: number;
        _data: unknown;
        constructor(body: unknown, init?: { status?: number }) {
            this._data = body;
            this.status = init?.status || 200;
        }
        async json() { return this._data; }
        static json(data: unknown, init?: { status?: number }) {
            return new MockNextResponse(data, init);
        }
    }
    return {
        NextRequest: MockNextRequest,
        NextResponse: MockNextResponse,
    };
});

vi.mock("@/lib/controllers/hashnode-publish", () => ({
    HashnodePublishController: {
        publish: vi.fn(),
    },
}));

import { HashnodePublishController } from "@/lib/controllers/hashnode-publish";

async function postPublish(projectId: string, userId: string, userEmail: string) {
    const { POST } = await import("@/app/api/projects/[id]/publish-to-hashnode/route");
    const req = new MockNextRequest({
        body: {},
        headers: { "x-user-id": userId, "x-user-email": userEmail },
    });
    return (await POST(req as never, { params: Promise.resolve({ id: projectId }) })) as unknown as {
        status: number;
    };
}

describe("POST /api/projects/[id]/publish-to-hashnode access", () => {
    let ownerId: string;
    let projectId: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.mocked(HashnodePublishController.publish).mockResolvedValue({
            hashnodePostId: "post-1",
            hashnodePostUrl: "https://owner.hashnode.dev/post",
            publishStatus: "draft",
        });
        const owner = await testPrisma.user.create({
            data: { email: "owner@example.com", googleId: "google-owner-1", name: "Owner" },
        });
        const project = await testPrisma.project.create({
            data: { title: "Shared Novel", author: "Owner", userId: owner.id },
        });
        ownerId = owner.id;
        projectId = project.id;
    });

    it("lets the owner publish", async () => {
        const res = await postPublish(projectId, ownerId, "owner@example.com");

        expect(res.status).toBe(201);
        expect(HashnodePublishController.publish).toHaveBeenCalledWith(projectId, ownerId, expect.any(Object));
    });

    it("refuses an editor, so they cannot publish the owner's manuscript to their own blog", async () => {
        const editor = await testPrisma.user.create({
            data: { email: "editor@example.com", googleId: "google-editor-1", name: "Editor" },
        });
        await testPrisma.projectShare.create({
            data: { projectId, email: "editor@example.com", role: "EDITOR" },
        });

        const res = await postPublish(projectId, editor.id, "editor@example.com");

        expect(res.status).toBe(403);
        expect(HashnodePublishController.publish).not.toHaveBeenCalled();
    });

    it("refuses an unrelated user", async () => {
        const other = await testPrisma.user.create({
            data: { email: "other@example.com", googleId: "google-other-1", name: "Other" },
        });

        const res = await postPublish(projectId, other.id, "other@example.com");

        expect(res.status).toBe(403);
        expect(HashnodePublishController.publish).not.toHaveBeenCalled();
    });
});
