import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import {
    verifyProjectAccess,
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

describe("api-auth", () => {
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
