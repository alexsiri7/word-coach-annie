import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma } from "./setup";

class MockNextRequest {
    private _body: unknown;
    nextUrl: { searchParams: URLSearchParams };
    headers: Map<string, string>;

    constructor(url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) {
        this._body = init?.body ? JSON.parse(init.body) : null;
        this.nextUrl = { searchParams: new URL(url, "http://localhost").searchParams };
        this.headers = new Map();
        if (init?.headers) {
            for (const [k, v] of Object.entries(init.headers)) {
                this.headers.set(k, v);
            }
        }
    }

    get(key: string): string | null {
        return this.headers.get(key) ?? null;
    }

    async json() {
        return this._body;
    }
}

vi.mock("next/server", () => ({
    NextRequest: MockNextRequest,
    NextResponse: {
        json: (data: unknown, init?: { status?: number }) => ({
            data,
            status: init?.status || 200,
            async json() { return data; },
        }),
    },
    NextResponse_constructor: class {
        status: number;
        constructor(_body: unknown, init?: { status?: number }) {
            this.status = init?.status || 200;
        }
    },
}));

// The share route DELETE returns `new NextResponse(null, { status: 204 })`.
// Our mock above only covers NextResponse.json(). We need the constructor too.
// Re-mock to handle both patterns.
vi.mock("next/server", () => {
    class MockResp {
        status: number;
        _data: unknown;
        constructor(body: unknown, init?: { status?: number }) {
            this._data = body;
            this.status = init?.status || 200;
        }
        async json() { return this._data; }
    }
    return {
        NextRequest: MockNextRequest,
        NextResponse: Object.assign(
            function (body: unknown, init?: { status?: number }) {
                return new MockResp(body, init);
            } as object,
            {
                json: (data: unknown, init?: { status?: number }) => {
                    const r = new MockResp(data, init);
                    r._data = data;
                    return r;
                },
            }
        ),
    };
});

function mockParams<T>(params: T): { params: Promise<T> } {
    return { params: Promise.resolve(params) };
}

function makeRequest(
    url: string,
    opts?: { method?: string; body?: Record<string, unknown>; userId?: string; userEmail?: string }
) {
    const headers: Record<string, string> = {};
    if (opts?.userId) headers["x-user-id"] = opts.userId;
    if (opts?.userEmail) headers["x-user-email"] = opts.userEmail;
    return new MockNextRequest(url, {
        method: opts?.method,
        body: opts?.body ? JSON.stringify(opts.body) : undefined,
        headers,
    });
}

// ─── Test data helpers ───────────────────────────────────────────────

async function createOwnerAndProject() {
    const owner = await testPrisma.user.create({
        data: { email: "owner@example.com", googleId: "google-owner-1", name: "Owner" },
    });
    const project = await testPrisma.project.create({
        data: { title: "Shared Novel", author: "Owner", userId: owner.id },
    });
    return { owner, project };
}

async function createOtherUser() {
    return testPrisma.user.create({
        data: { email: "other@example.com", googleId: "google-other-1", name: "Other" },
    });
}

// ─── 1. Share management API tests ───────────────────────────────────

describe("Share management API — /api/projects/[id]/share", () => {
    let ownerId: string;
    let projectId: string;

    beforeEach(async () => {
        const { owner, project } = await createOwnerAndProject();
        ownerId = owner.id;
        projectId = project.id;
    });

    it("POST — owner can add a reader by email", async () => {
        const { POST } = await import("@/app/api/projects/[id]/share/route");
        const req = makeRequest(`http://localhost/api/projects/${projectId}/share`, {
            method: "POST",
            body: { email: "reader@example.com" },
            userId: ownerId,
        });
        const res = await POST(req as never, mockParams({ id: projectId }));

        expect((res as any).status).toBe(201);
        const body = await (res as any).json();
        expect(body.email).toBe("reader@example.com");
        expect(body.role).toBe("READER");

        // Verify in DB
        const share = await testPrisma.projectShare.findFirst({ where: { projectId } });
        expect(share).not.toBeNull();
        expect(share!.email).toBe("reader@example.com");
    });

    it("POST — returns 409 for duplicate email", async () => {
        await testPrisma.projectShare.create({
            data: { projectId, email: "reader@example.com", role: "READER" },
        });

        const { POST } = await import("@/app/api/projects/[id]/share/route");
        const req = makeRequest(`http://localhost/api/projects/${projectId}/share`, {
            method: "POST",
            body: { email: "reader@example.com" },
            userId: ownerId,
        });
        const res = await POST(req as never, mockParams({ id: projectId }));

        expect((res as any).status).toBe(409);
        const body = await (res as any).json();
        expect(body.error).toMatch(/already/i);
    });

    it("POST — returns 400 for invalid email", async () => {
        const { POST } = await import("@/app/api/projects/[id]/share/route");
        const req = makeRequest(`http://localhost/api/projects/${projectId}/share`, {
            method: "POST",
            body: { email: "not-an-email" },
            userId: ownerId,
        });
        const res = await POST(req as never, mockParams({ id: projectId }));

        expect((res as any).status).toBe(400);
    });

    it("POST — non-owner gets 403", async () => {
        const other = await createOtherUser();

        const { POST } = await import("@/app/api/projects/[id]/share/route");
        const req = makeRequest(`http://localhost/api/projects/${projectId}/share`, {
            method: "POST",
            body: { email: "reader@example.com" },
            userId: other.id,
        });
        const res = await POST(req as never, mockParams({ id: projectId }));

        expect((res as any).status).toBe(403);
    });

    it("GET — owner can list shares", async () => {
        await testPrisma.projectShare.create({
            data: { projectId, email: "alice@example.com", role: "READER" },
        });
        await testPrisma.projectShare.create({
            data: { projectId, email: "bob@example.com", role: "READER" },
        });

        const { GET } = await import("@/app/api/projects/[id]/share/route");
        const req = makeRequest(`http://localhost/api/projects/${projectId}/share`, {
            userId: ownerId,
        });
        const res = await GET(req as never, mockParams({ id: projectId }));

        expect((res as any).status).toBe(200);
        const body = await (res as any).json();
        expect(body.shares).toHaveLength(2);
        expect(body.shares.map((s: { email: string }) => s.email).sort()).toEqual(
            ["alice@example.com", "bob@example.com"]
        );
    });

    it("GET — non-owner gets 403", async () => {
        const other = await createOtherUser();

        const { GET } = await import("@/app/api/projects/[id]/share/route");
        const req = makeRequest(`http://localhost/api/projects/${projectId}/share`, {
            userId: other.id,
        });
        const res = await GET(req as never, mockParams({ id: projectId }));

        expect((res as any).status).toBe(403);
    });

    it("DELETE — owner can remove a reader", async () => {
        await testPrisma.projectShare.create({
            data: { projectId, email: "reader@example.com", role: "READER" },
        });

        const { DELETE } = await import("@/app/api/projects/[id]/share/route");
        const req = makeRequest(`http://localhost/api/projects/${projectId}/share`, {
            method: "DELETE",
            body: { email: "reader@example.com" },
            userId: ownerId,
        });
        const res = await DELETE(req as never, mockParams({ id: projectId }));

        expect((res as any).status).toBe(204);

        // Verify removal in DB
        const remaining = await testPrisma.projectShare.findMany({ where: { projectId } });
        expect(remaining).toHaveLength(0);
    });

    it("DELETE — non-owner gets 403", async () => {
        const other = await createOtherUser();

        const { DELETE } = await import("@/app/api/projects/[id]/share/route");
        const req = makeRequest(`http://localhost/api/projects/${projectId}/share`, {
            method: "DELETE",
            body: { email: "reader@example.com" },
            userId: other.id,
        });
        const res = await DELETE(req as never, mockParams({ id: projectId }));

        expect((res as any).status).toBe(403);
    });
});

// ─── 2. Manuscript API tests ─────────────────────────────────────────

describe("Manuscript API — GET /api/projects/[id]/manuscript", () => {
    let ownerId: string;
    let projectId: string;

    beforeEach(async () => {
        const { owner, project } = await createOwnerAndProject();
        ownerId = owner.id;
        projectId = project.id;
    });

    it("owner can access", async () => {
        const { GET } = await import("@/app/api/projects/[id]/manuscript/route");
        const req = makeRequest(`http://localhost/api/projects/${projectId}/manuscript`, {
            userId: ownerId,
        });
        const res = await GET(req as never, mockParams({ id: projectId }));

        expect((res as any).status).toBe(200);
        const body = await (res as any).json();
        expect(body.title).toBe("Shared Novel");
    });

    it("shared reader can access", async () => {
        const reader = await createOtherUser();
        await testPrisma.projectShare.create({
            data: { projectId, email: reader.email, role: "READER" },
        });

        const { GET } = await import("@/app/api/projects/[id]/manuscript/route");
        const req = makeRequest(`http://localhost/api/projects/${projectId}/manuscript`, {
            userId: reader.id,
            userEmail: reader.email,
        });
        const res = await GET(req as never, mockParams({ id: projectId }));

        expect((res as any).status).toBe(200);
        const body = await (res as any).json();
        expect(body.title).toBe("Shared Novel");
    });

    it("non-shared user gets 403", async () => {
        const stranger = await createOtherUser();

        const { GET } = await import("@/app/api/projects/[id]/manuscript/route");
        const req = makeRequest(`http://localhost/api/projects/${projectId}/manuscript`, {
            userId: stranger.id,
            userEmail: stranger.email,
        });
        const res = await GET(req as never, mockParams({ id: projectId }));

        expect((res as any).status).toBe(403);
    });

    it("OUTLINE scenes are excluded", async () => {
        const chapter = await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Chapter 1", orderIndex: 0 },
        });
        // OUTLINE scene — should be excluded
        await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Outline Scene", orderIndex: 0, parentId: chapter.id, status: "OUTLINE" },
        });
        // DRAFT scene — should be included
        const draftScene = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Draft Scene", orderIndex: 1, parentId: chapter.id, status: "DRAFT" },
        });
        await testPrisma.contentVersion.create({
            data: { nodeId: draftScene.id, content: "Some draft content", wordCount: 3 },
        });

        const { GET } = await import("@/app/api/projects/[id]/manuscript/route");
        const req = makeRequest(`http://localhost/api/projects/${projectId}/manuscript`, {
            userId: ownerId,
        });
        const res = await GET(req as never, mockParams({ id: projectId }));
        const body = await (res as any).json();

        // Only the draft scene should appear
        const allScenes = body.chapters.flatMap((ch: { scenes: { title: string }[] }) => ch.scenes);
        expect(allScenes).toHaveLength(1);
        expect(allScenes[0].title).toBe("Draft Scene");
    });

    it("DRAFT/REVISED/FINAL scenes are included", async () => {
        const chapter = await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Chapter 1", orderIndex: 0 },
        });
        const draft = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Draft", orderIndex: 0, parentId: chapter.id, status: "DRAFT" },
        });
        const revised = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Revised", orderIndex: 1, parentId: chapter.id, status: "REVISED" },
        });
        const final = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Final", orderIndex: 2, parentId: chapter.id, status: "FINAL" },
        });

        for (const scene of [draft, revised, final]) {
            await testPrisma.contentVersion.create({
                data: { nodeId: scene.id, content: `Content of ${scene.title}`, wordCount: 3 },
            });
        }

        const { GET } = await import("@/app/api/projects/[id]/manuscript/route");
        const req = makeRequest(`http://localhost/api/projects/${projectId}/manuscript`, {
            userId: ownerId,
        });
        const res = await GET(req as never, mockParams({ id: projectId }));
        const body = await (res as any).json();

        const allScenes = body.chapters.flatMap((ch: { scenes: { title: string }[] }) => ch.scenes);
        expect(allScenes).toHaveLength(3);
        expect(allScenes.map((s: { title: string }) => s.title)).toEqual(["Draft", "Revised", "Final"]);
    });

    it("returns correct structure (chapters > scenes with content)", async () => {
        const ch1 = await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Chapter 1", orderIndex: 0 },
        });
        const ch2 = await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Chapter 2", orderIndex: 1 },
        });
        const scene1 = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Opening", orderIndex: 0, parentId: ch1.id, status: "DRAFT" },
        });
        const scene2 = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Confrontation", orderIndex: 0, parentId: ch2.id, status: "DRAFT" },
        });

        await testPrisma.contentVersion.create({
            data: { nodeId: scene1.id, content: "<p>It was a dark night.</p>", wordCount: 5 },
        });
        await testPrisma.contentVersion.create({
            data: { nodeId: scene2.id, content: "<p>The villain appeared.</p>", wordCount: 3 },
        });

        const { GET } = await import("@/app/api/projects/[id]/manuscript/route");
        const req = makeRequest(`http://localhost/api/projects/${projectId}/manuscript`, {
            userId: ownerId,
        });
        const res = await GET(req as never, mockParams({ id: projectId }));
        const body = await (res as any).json();

        expect(body.title).toBe("Shared Novel");
        expect(body.author).toBe("Owner");
        expect(body.chapters).toHaveLength(2);
        expect(body.chapters[0].title).toBe("Chapter 1");
        expect(body.chapters[0].scenes).toHaveLength(1);
        expect(body.chapters[0].scenes[0].title).toBe("Opening");
        expect(body.chapters[0].scenes[0].content).toBe("<p>It was a dark night.</p>");
        expect(body.chapters[1].title).toBe("Chapter 2");
        expect(body.chapters[1].scenes[0].content).toBe("<p>The villain appeared.</p>");
    });
});

// ─── 3. Access control tests ─────────────────────────────────────────

describe("Access control — verifyProjectAccess / verifyProjectReadAccess", () => {
    let ownerId: string;
    let projectId: string;

    beforeEach(async () => {
        const { owner, project } = await createOwnerAndProject();
        ownerId = owner.id;
        projectId = project.id;
    });

    it("verifyProjectAccess — owner gets authorized with role OWNER", async () => {
        const { verifyProjectAccess } = await import("@/lib/api-auth");
        const result = await verifyProjectAccess(projectId, ownerId);

        expect(result.authorized).toBe(true);
        if (result.authorized) {
            expect(result.role).toBe("OWNER");
            expect(result.project.id).toBe(projectId);
        }
    });

    it("verifyProjectAccess — non-owner gets 403", async () => {
        const other = await createOtherUser();

        const { verifyProjectAccess } = await import("@/lib/api-auth");
        const result = await verifyProjectAccess(projectId, other.id);

        expect(result.authorized).toBe(false);
        if (!result.authorized) {
            expect(result.response.status).toBe(403);
        }
    });

    it("verifyProjectReadAccess — owner gets authorized with role OWNER", async () => {
        const { verifyProjectReadAccess } = await import("@/lib/api-auth");
        const result = await verifyProjectReadAccess(projectId, ownerId, "owner@example.com");

        expect(result.authorized).toBe(true);
        if (result.authorized) {
            expect(result.role).toBe("OWNER");
        }
    });

    it("verifyProjectReadAccess — shared reader gets authorized with role READER", async () => {
        const reader = await createOtherUser();
        await testPrisma.projectShare.create({
            data: { projectId, email: reader.email, role: "READER" },
        });

        const { verifyProjectReadAccess } = await import("@/lib/api-auth");
        const result = await verifyProjectReadAccess(projectId, reader.id, reader.email);

        expect(result.authorized).toBe(true);
        if (result.authorized) {
            expect(result.role).toBe("READER");
        }
    });

    it("verifyProjectReadAccess — non-shared user gets 403", async () => {
        const stranger = await createOtherUser();

        const { verifyProjectReadAccess } = await import("@/lib/api-auth");
        const result = await verifyProjectReadAccess(projectId, stranger.id, stranger.email);

        expect(result.authorized).toBe(false);
        if (!result.authorized) {
            expect(result.response.status).toBe(403);
        }
    });
});
