import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import * as Sentry from "@sentry/nextjs";

vi.mock("@sentry/nextjs", () => ({
    setUser: vi.fn(),
}));

import {
    getCurrentUserId,
    verifyProjectAccess,
    verifyProjectReadAccess,
    verifyProjectReadAccessByNode,
    verifyUniverseAccess,
    verifyProjectAccessByNode,
    verifyProjectWriteAccess,
    verifyProjectWriteAccessByNode,
    verifyWritingTaskWriteAccess,
    validateCsrfHeader,
} from "@/lib/api-auth";
import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController } from "@/lib/controllers/structure";

async function createTestUser(id: string) {
    return prisma.user.create({
        data: {
            id,
            email: `${id}@test.com`,
            googleId: `google-${id}`,
            name: "Test User",
        },
    });
}

describe("api-auth", () => {
    describe("getCurrentUserId", () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it("returns userId from x-user-id header", () => {
            const headers = new Headers({ "x-user-id": "user-abc", "x-user-email": "abc@test.com" });
            const request = { headers } as unknown as import("next/server").NextRequest;
            expect(getCurrentUserId(request)).toBe("user-abc");
        });

        it("returns null when x-user-id header is absent", () => {
            const headers = new Headers();
            const request = { headers } as unknown as import("next/server").NextRequest;
            expect(getCurrentUserId(request)).toBeNull();
        });

        it("should call Sentry.setUser with id only (no email)", () => {
            const headers = new Headers({ "x-user-id": "user-abc", "x-user-email": "abc@test.com" });
            const request = { headers } as unknown as import("next/server").NextRequest;
            getCurrentUserId(request);
            expect(Sentry.setUser).toHaveBeenCalledWith({ id: "user-abc" });
            expect(Sentry.setUser).not.toHaveBeenCalledWith(
                expect.objectContaining({ email: expect.any(String) })
            );
        });
    });

    describe("verifyProjectReadAccess", () => {
        it("returns 404 for non-existent project", async () => {
            const result = await verifyProjectReadAccess("nonexistent", "user-1");
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(404);
            }
        });

        it("allows access when userId is null (dev mode)", async () => {
            const project = await ProjectsController.createProject({ title: "ReadTest" });
            const result = await verifyProjectReadAccess(project.id, null);
            expect(result.authorized).toBe(true);
            if (result.authorized) {
                expect(result.role).toBeNull();
            }
        });

        it("allows owner access with OWNER role", async () => {
            const user = await createTestUser("read-owner");
            const project = await prisma.project.create({
                data: { title: "Owned", userId: user.id },
            });
            const result = await verifyProjectReadAccess(project.id, user.id, user.email);
            expect(result.authorized).toBe(true);
            if (result.authorized) {
                expect(result.role).toBe("OWNER");
            }
        });

        it("allows shared reader access with READER role", async () => {
            const owner = await createTestUser("read-proj-owner");
            const reader = await createTestUser("read-proj-reader");
            const project = await prisma.project.create({
                data: { title: "Shared", userId: owner.id },
            });
            await prisma.projectShare.create({
                data: { projectId: project.id, email: reader.email },
            });
            const result = await verifyProjectReadAccess(project.id, reader.id, reader.email);
            expect(result.authorized).toBe(true);
            if (result.authorized) {
                expect(result.role).toBe("READER");
            }
        });

        it("denies access to non-owner non-shared user", async () => {
            const owner = await createTestUser("read-deny-owner");
            const project = await prisma.project.create({
                data: { title: "Private", userId: owner.id },
            });
            const result = await verifyProjectReadAccess(project.id, "stranger", "stranger@test.com");
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(403);
            }
        });

        it("denies access when no email provided for non-owner", async () => {
            const owner = await createTestUser("read-no-email");
            const project = await prisma.project.create({
                data: { title: "NoEmail", userId: owner.id },
            });
            const result = await verifyProjectReadAccess(project.id, "stranger", null);
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(403);
            }
        });
    });

    describe("verifyProjectAccess", () => {
        it("returns 404 for non-existent project", async () => {
            const result = await verifyProjectAccess("nonexistent", "user-1");
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(404);
            }
        });

        it("allows access when userId is null (dev mode)", async () => {
            const project = await ProjectsController.createProject({ title: "Test" });
            const result = await verifyProjectAccess(project.id, null);
            expect(result.authorized).toBe(true);
        });

        it("denies access when project has no owner and user is authenticated", async () => {
            const project = await ProjectsController.createProject({ title: "Legacy" });
            // Unowned projects are not accessible to authenticated users
            const result = await verifyProjectAccess(project.id, "some-user");
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(403);
            }
        });

        it("allows access when userId matches project owner", async () => {
            const user = await createTestUser("user-123");
            const project = await prisma.project.create({
                data: { title: "Owned", userId: user.id },
            });
            const result = await verifyProjectAccess(project.id, user.id);
            expect(result.authorized).toBe(true);
        });

        it("returns 403 when userId doesn't match project owner", async () => {
            const user = await createTestUser("user-owner");
            const project = await prisma.project.create({
                data: { title: "Owned", userId: user.id },
            });
            const result = await verifyProjectAccess(project.id, "user-456");
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(403);
            }
        });
    });

    describe("verifyUniverseAccess", () => {
        it("returns 404 for non-existent universe", async () => {
            const result = await verifyUniverseAccess("nonexistent", "user-1");
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(404);
            }
        });

        it("allows access when userId is null (dev mode)", async () => {
            const universe = await prisma.universe.create({
                data: { title: "Test Universe" },
            });
            const result = await verifyUniverseAccess(universe.id, null);
            expect(result.authorized).toBe(true);
        });

        it("denies access when universe has no owner and user is authenticated", async () => {
            const universe = await prisma.universe.create({
                data: { title: "Legacy Universe" },
            });
            const result = await verifyUniverseAccess(universe.id, "some-user");
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(403);
            }
        });

        it("allows access when userId matches universe owner", async () => {
            const user = await createTestUser("user-univ");
            const universe = await prisma.universe.create({
                data: { title: "Owned Universe", userId: user.id },
            });
            const result = await verifyUniverseAccess(universe.id, user.id);
            expect(result.authorized).toBe(true);
        });

        it("returns 403 when userId doesn't match universe owner", async () => {
            const user = await createTestUser("user-univ2");
            const universe = await prisma.universe.create({
                data: { title: "Owned Universe", userId: user.id },
            });
            const result = await verifyUniverseAccess(universe.id, "user-456");
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(403);
            }
        });
    });

    describe("verifyProjectAccessByNode", () => {
        it("returns 404 for non-existent node", async () => {
            const result = await verifyProjectAccessByNode("nonexistent", "user-1");
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(404);
            }
        });

        it("allows access to node when project is accessible", async () => {
            const project = await ProjectsController.createProject({ title: "Test" });
            const node = await StructureController.createNode({
                projectId: project.id,
                type: "SCENE",
                title: "Scene 1",
            });
            const result = await verifyProjectAccessByNode(node.id, null);
            expect(result.authorized).toBe(true);
            if (result.authorized) {
                expect(result.projectId).toBe(project.id);
            }
        });

        it("returns 403 when project owner doesn't match", async () => {
            const user = await createTestUser("user-node");
            const project = await prisma.project.create({
                data: { title: "Owned", userId: user.id },
            });
            const node = await StructureController.createNode({
                projectId: project.id,
                type: "SCENE",
                title: "Scene 1",
            });
            const result = await verifyProjectAccessByNode(node.id, "user-456");
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(403);
            }
        });
    });

    describe("verifyProjectReadAccessByNode", () => {
        it("returns 404 for a non-existent node", async () => {
            const result = await verifyProjectReadAccessByNode("nonexistent-node", "user-1");
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(404);
            }
        });

        it("allows OWNER access and propagates OWNER role", async () => {
            const user = await createTestUser("rbn-owner");
            const project = await prisma.project.create({ data: { title: "Owned", userId: user.id } });
            const node = await StructureController.createNode({ projectId: project.id, type: "SCENE", title: "S" });
            const result = await verifyProjectReadAccessByNode(node.id, user.id, user.email);
            expect(result.authorized).toBe(true);
            if (result.authorized) {
                expect(result.role).toBe("OWNER");
                expect(result.projectId).toBe(project.id);
            }
        });

        it("allows READER-role share to create annotations (regression guard for fix #1014)", async () => {
            const owner = await createTestUser("rbn-proj-owner");
            const reader = await createTestUser("rbn-proj-reader");
            const project = await prisma.project.create({ data: { title: "Shared", userId: owner.id } });
            await prisma.projectShare.create({ data: { projectId: project.id, email: reader.email } });
            const node = await StructureController.createNode({ projectId: project.id, type: "SCENE", title: "S" });
            const result = await verifyProjectReadAccessByNode(node.id, reader.id, reader.email);
            expect(result.authorized).toBe(true);
            if (result.authorized) {
                expect(result.role).toBe("READER");
            }
        });

        it("denies access to a non-shared user", async () => {
            const owner = await createTestUser("rbn-deny-owner");
            const project = await prisma.project.create({ data: { title: "Private", userId: owner.id } });
            const node = await StructureController.createNode({ projectId: project.id, type: "SCENE", title: "S" });
            const result = await verifyProjectReadAccessByNode(node.id, "stranger", "stranger@example.com");
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(403);
            }
        });
    });

    describe("verifyProjectWriteAccess", () => {
        it("returns 404 for non-existent project", async () => {
            const result = await verifyProjectWriteAccess("nonexistent", "user-1");
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(404);
            }
        });

        it("allows access when userId is null (dev mode)", async () => {
            const project = await ProjectsController.createProject({ title: "WriteTest" });
            const result = await verifyProjectWriteAccess(project.id, null);
            expect(result.authorized).toBe(true);
            if (result.authorized) {
                expect(result.role).toBeNull();
            }
        });

        it("allows owner access with OWNER role", async () => {
            const user = await createTestUser("write-owner");
            const project = await prisma.project.create({
                data: { title: "Owned", userId: user.id },
            });
            const result = await verifyProjectWriteAccess(project.id, user.id, user.email);
            expect(result.authorized).toBe(true);
            if (result.authorized) {
                expect(result.role).toBe("OWNER");
                expect(project.userId).toBe(user.id);
            }
        });

        it("allows EDITOR share access, looking up the email in lower case", async () => {
            const owner = await createTestUser("write-proj-owner");
            const editor = await createTestUser("write-proj-editor");
            const project = await prisma.project.create({
                data: { title: "Shared", userId: owner.id },
            });
            await prisma.projectShare.create({
                data: { projectId: project.id, email: editor.email, role: "EDITOR" },
            });
            const result = await verifyProjectWriteAccess(project.id, editor.id, editor.email.toUpperCase());
            expect(result.authorized).toBe(true);
            if (result.authorized) {
                expect(result.role).toBe("EDITOR");
            }
        });

        it("denies a READER share — a reader can't edit", async () => {
            const owner = await createTestUser("write-proj-owner-2");
            const reader = await createTestUser("write-proj-reader");
            const project = await prisma.project.create({
                data: { title: "Shared", userId: owner.id },
            });
            await prisma.projectShare.create({
                data: { projectId: project.id, email: reader.email },
            });
            const result = await verifyProjectWriteAccess(project.id, reader.id, reader.email);
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(403);
            }
        });

        it("denies access when no email provided for non-owner", async () => {
            const owner = await createTestUser("write-no-email-owner");
            const project = await prisma.project.create({
                data: { title: "NoEmail", userId: owner.id },
            });
            const result = await verifyProjectWriteAccess(project.id, "stranger", null);
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(403);
            }
        });
    });

    describe("verifyProjectWriteAccessByNode", () => {
        it("returns 404 for a non-existent node", async () => {
            const result = await verifyProjectWriteAccessByNode("nonexistent-node", "user-1");
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(404);
                expect(await result.response.json()).toEqual({ error: "Node not found" });
            }
        });

        it("allows EDITOR share access and propagates projectId and role", async () => {
            const owner = await createTestUser("wbn-proj-owner");
            const editor = await createTestUser("wbn-proj-editor");
            const project = await prisma.project.create({ data: { title: "Shared", userId: owner.id } });
            await prisma.projectShare.create({
                data: { projectId: project.id, email: editor.email, role: "EDITOR" },
            });
            const node = await StructureController.createNode({ projectId: project.id, type: "SCENE", title: "S" });
            const result = await verifyProjectWriteAccessByNode(node.id, editor.id, editor.email);
            expect(result.authorized).toBe(true);
            if (result.authorized) {
                expect(result.projectId).toBe(project.id);
                expect(result.role).toBe("EDITOR");
            }
        });

        it("denies a READER share", async () => {
            const owner = await createTestUser("wbn-proj-owner-2");
            const reader = await createTestUser("wbn-proj-reader");
            const project = await prisma.project.create({ data: { title: "Shared", userId: owner.id } });
            await prisma.projectShare.create({ data: { projectId: project.id, email: reader.email } });
            const node = await StructureController.createNode({ projectId: project.id, type: "SCENE", title: "S" });
            const result = await verifyProjectWriteAccessByNode(node.id, reader.id, reader.email);
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(403);
            }
        });
    });

    describe("verifyWritingTaskWriteAccess", () => {
        it("project-less (practice) tasks are writable only by their owner", async () => {
            const task = { projectId: null, userId: "u1" };

            const deniedForOther = await verifyWritingTaskWriteAccess(task, "u2");
            expect(deniedForOther.authorized).toBe(false);
            if (!deniedForOther.authorized) {
                expect(deniedForOther.response.status).toBe(403);
            }

            const allowedForOwner = await verifyWritingTaskWriteAccess(task, "u1");
            expect(allowedForOwner.authorized).toBe(true);

            const allowedInDevMode = await verifyWritingTaskWriteAccess(task, null);
            expect(allowedInDevMode.authorized).toBe(true);
        });

        it("delegates project tasks to verifyProjectWriteAccess — a reader can't edit", async () => {
            const owner = await createTestUser("wtwa-owner");
            const reader = await createTestUser("wtwa-reader");
            const project = await prisma.project.create({ data: { title: "Shared", userId: owner.id } });
            await prisma.projectShare.create({ data: { projectId: project.id, email: reader.email } });

            const result = await verifyWritingTaskWriteAccess(
                { projectId: project.id, userId: owner.id },
                reader.id,
                reader.email
            );
            expect(result.authorized).toBe(false);
            if (!result.authorized) {
                expect(result.response.status).toBe(403);
            }
        });
    });

    describe("validateCsrfHeader", () => {
        it("returns null when X-CSRF-Protection header is '1'", () => {
            const headers = new Headers({ "x-csrf-protection": "1" });
            const request = { headers, url: "http://localhost/test" } as unknown as import("next/server").NextRequest;
            const result = validateCsrfHeader(request);
            expect(result).toBeNull();
        });

        it("returns 403 when X-CSRF-Protection header is absent", async () => {
            const headers = new Headers();
            const request = { headers, url: "http://localhost/test" } as unknown as import("next/server").NextRequest;
            const result = validateCsrfHeader(request);
            expect(result).not.toBeNull();
            expect(result!.status).toBe(403);
            expect(await result!.json()).toEqual({ error: "Forbidden" });
        });

        it("returns 403 when X-CSRF-Protection header has wrong value", async () => {
            const headers = new Headers({ "x-csrf-protection": "true" });
            const request = { headers, url: "http://localhost/test" } as unknown as import("next/server").NextRequest;
            const result = validateCsrfHeader(request);
            expect(result).not.toBeNull();
            expect(result!.status).toBe(403);
            expect(await result!.json()).toEqual({ error: "Forbidden" });
        });

        it("returns 403 when X-CSRF-Protection header is empty string", async () => {
            const headers = new Headers({ "x-csrf-protection": "" });
            const request = { headers, url: "http://localhost/test" } as unknown as import("next/server").NextRequest;
            const result = validateCsrfHeader(request);
            expect(result).not.toBeNull();
            expect(result!.status).toBe(403);
            expect(await result!.json()).toEqual({ error: "Forbidden" });
        });
    });
});
