import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("@sentry/nextjs", () => ({
    setUser: vi.fn(),
}));

import {
    getCurrentUserId,
    verifyProjectAccess,
    verifyProjectReadAccess,
    verifyUniverseAccess,
    verifyProjectAccessByNode,
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
