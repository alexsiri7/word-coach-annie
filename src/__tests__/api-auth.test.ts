import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

vi.mock("@sentry/nextjs", () => ({
    setUser: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import {
    getCurrentUserId,
    validateCsrfHeader,
    verifyProjectAccess,
    verifyProjectReadAccess,
    verifyUniverseAccess,
    verifyProjectAccessByNode,
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

describe("validateCsrfHeader", () => {
    it("returns null when X-CSRF-Protection header is '1'", () => {
        const req = new NextRequest("http://localhost/api/test", {
            method: "PUT",
            headers: { "X-CSRF-Protection": "1" },
        });
        expect(validateCsrfHeader(req)).toBeNull();
    });

    it("returns 403 response when header is absent", () => {
        const req = new NextRequest("http://localhost/api/test", { method: "PUT" });
        const res = validateCsrfHeader(req);
        expect(res).not.toBeNull();
        expect(res!.status).toBe(403);
    });

    it("returns 403 response when header is wrong value", () => {
        const req = new NextRequest("http://localhost/api/test", {
            method: "PUT",
            headers: { "X-CSRF-Protection": "true" },
        });
        const res = validateCsrfHeader(req);
        expect(res!.status).toBe(403);
    });

    it("returns 403 response when header is empty string", () => {
        const req = new NextRequest("http://localhost/api/test", {
            method: "PUT",
            headers: { "X-CSRF-Protection": "" },
        });
        const res = validateCsrfHeader(req);
        expect(res!.status).toBe(403);
    });
});

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
});
