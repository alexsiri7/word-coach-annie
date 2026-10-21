import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
    AccessDeniedError,
    assertProjectOwner,
    assertUniverseOwner,
    projectIdForNode,
    projectIdForStoryObject,
    projectIdForAnnotation,
    universeIdForWorldObject,
    universeIdForTimelineEntry,
    relationshipOwner,
    assertRelationshipOwner,
} from "@/lib/ownership";

async function createTestUser(id: string) {
    return prisma.user.create({
        data: { id, email: `${id}@test.com`, googleId: `google-${id}` },
    });
}

describe("ownership", () => {
    beforeEach(async () => {
        await createTestUser("owner-a");
        await createTestUser("owner-b");
    });

    describe("assertProjectOwner", () => {
        it("is a no-op when uid is null (dev/API_TOKEN mode)", async () => {
            const project = await prisma.project.create({ data: { title: "P" } });
            await expect(assertProjectOwner(project.id, null)).resolves.toBeUndefined();
        });

        it("resolves for the owner", async () => {
            const project = await prisma.project.create({ data: { title: "P", userId: "owner-a" } });
            await expect(assertProjectOwner(project.id, "owner-a")).resolves.toBeUndefined();
        });

        it("throws for a non-owner", async () => {
            const project = await prisma.project.create({ data: { title: "P", userId: "owner-a" } });
            await expect(assertProjectOwner(project.id, "owner-b")).rejects.toThrow(AccessDeniedError);
        });

        it("throws when the project does not exist", async () => {
            await expect(assertProjectOwner("missing", "owner-a")).rejects.toThrow(/not found or access denied/);
        });
    });

    describe("assertUniverseOwner", () => {
        it("is a no-op when uid is null", async () => {
            const universe = await prisma.universe.create({ data: { title: "U" } });
            await expect(assertUniverseOwner(universe.id, null)).resolves.toBeUndefined();
        });

        it("denies an authenticated user access to an unowned universe", async () => {
            const universe = await prisma.universe.create({ data: { title: "U" } });
            await expect(assertUniverseOwner(universe.id, "owner-a")).rejects.toThrow(AccessDeniedError);
        });

        it("resolves for the owner", async () => {
            const universe = await prisma.universe.create({ data: { title: "U", userId: "owner-a" } });
            await expect(assertUniverseOwner(universe.id, "owner-a")).resolves.toBeUndefined();
        });
    });

    describe("projectIdForNode / projectIdForStoryObject / projectIdForAnnotation", () => {
        it("resolves the owning project for a node, story object, and annotation", async () => {
            const project = await prisma.project.create({ data: { title: "P" } });
            const node = await prisma.structureNode.create({
                data: { projectId: project.id, type: "SCENE", title: "Scene 1" },
            });
            const storyObject = await prisma.storyObject.create({
                data: { projectId: project.id, type: "CHARACTER", name: "Hero" },
            });
            const annotation = await prisma.annotation.create({
                data: { nodeId: node.id, content: "note" },
            });

            await expect(projectIdForNode(node.id)).resolves.toBe(project.id);
            await expect(projectIdForStoryObject(storyObject.id)).resolves.toBe(project.id);
            await expect(projectIdForAnnotation(annotation.id)).resolves.toBe(project.id);
        });

        it("throws AccessDeniedError for missing resources", async () => {
            await expect(projectIdForNode("missing")).rejects.toThrow(AccessDeniedError);
            await expect(projectIdForStoryObject("missing")).rejects.toThrow(AccessDeniedError);
            await expect(projectIdForAnnotation("missing")).rejects.toThrow(AccessDeniedError);
        });
    });

    describe("universeIdForWorldObject / universeIdForTimelineEntry", () => {
        it("resolves the owning universe for a world object and its timeline entry", async () => {
            const universe = await prisma.universe.create({ data: { title: "U" } });
            const worldObject = await prisma.worldObject.create({
                data: { universeId: universe.id, type: "CHARACTER", name: "Hero" },
            });
            const entry = await prisma.worldObjectTimelineEntry.create({
                data: { worldObjectId: worldObject.id, label: "Birth" },
            });

            await expect(universeIdForWorldObject(worldObject.id)).resolves.toBe(universe.id);
            await expect(universeIdForTimelineEntry(entry.id)).resolves.toBe(universe.id);
        });

        it("throws AccessDeniedError for missing resources", async () => {
            await expect(universeIdForWorldObject("missing")).rejects.toThrow(AccessDeniedError);
            await expect(universeIdForTimelineEntry("missing")).rejects.toThrow(AccessDeniedError);
        });
    });

    describe("relationshipOwner / assertRelationshipOwner", () => {
        it("prefers the project over the universe when a relationship has both", async () => {
            const project = await prisma.project.create({ data: { title: "P" } });
            const universe = await prisma.universe.create({ data: { title: "U" } });
            const node = await prisma.structureNode.create({
                data: { projectId: project.id, type: "SCENE", title: "Scene 1" },
            });
            const worldObject = await prisma.worldObject.create({
                data: { universeId: universe.id, type: "CHARACTER", name: "Hero" },
            });
            const rel = await prisma.relationship.create({
                data: { type: "RELATED_TO", fromNodeId: node.id, toWorldObjectId: worldObject.id },
            });

            await expect(relationshipOwner(rel.id)).resolves.toEqual({ projectId: project.id });
        });

        it("falls back to the universe when there is no project side", async () => {
            const universe = await prisma.universe.create({ data: { title: "U" } });
            const fromObj = await prisma.worldObject.create({
                data: { universeId: universe.id, type: "CHARACTER", name: "A" },
            });
            const toObj = await prisma.worldObject.create({
                data: { universeId: universe.id, type: "CHARACTER", name: "B" },
            });
            const rel = await prisma.relationship.create({
                data: { type: "RELATED_TO", fromWorldObjectId: fromObj.id, toWorldObjectId: toObj.id },
            });

            await expect(relationshipOwner(rel.id)).resolves.toEqual({ universeId: universe.id });
        });

        it("denies by default for an orphaned relationship (no live endpoints)", async () => {
            const rel = await prisma.relationship.create({ data: { type: "RELATED_TO" } });
            await expect(relationshipOwner(rel.id)).rejects.toThrow(AccessDeniedError);
            await expect(assertRelationshipOwner(rel.id, "owner-a")).rejects.toThrow(AccessDeniedError);
        });

        it("assertRelationshipOwner enforces project ownership", async () => {
            const project = await prisma.project.create({ data: { title: "P", userId: "owner-a" } });
            const node = await prisma.structureNode.create({
                data: { projectId: project.id, type: "SCENE", title: "Scene 1" },
            });
            const rel = await prisma.relationship.create({ data: { type: "RELATED_TO", fromNodeId: node.id } });

            await expect(assertRelationshipOwner(rel.id, "owner-a")).resolves.toBeUndefined();
            await expect(assertRelationshipOwner(rel.id, "owner-b")).rejects.toThrow(AccessDeniedError);
        });
    });
});
