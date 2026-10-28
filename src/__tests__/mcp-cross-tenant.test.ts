import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/db";

vi.mock("../mcp/snapshot", () => ({
    initSnapshotRepo: vi.fn(),
    createSnapshot: vi.fn(() => ({ hash: "abc123", message: "test" })),
    listSnapshots: vi.fn(() => []),
    restoreSnapshot: vi.fn(() => ({ hash: "def456", message: "restored" })),
    autoSnapshot: vi.fn(),
}));

vi.mock("../lib/controllers/google-auth", () => ({
    GoogleAuthController: {
        getStatus: vi.fn(async () => ({ connected: false })),
        getAuthUrl: vi.fn(() => "https://example.com/auth"),
        handleCallback: vi.fn(async () => ({})),
        disconnect: vi.fn(async () => {}),
        getValidClient: vi.fn(async () => null),
    },
}));

import { GoogleAuthController } from "../lib/controllers/google-auth";
import { GoogleDocsApi } from "../lib/google-api";

type ToolResult = { isError?: boolean; content: Array<{ text: string }> };

/**
 * Calls a tool's handler directly, bypassing the MCP protocol dispatch layer.
 * The real dispatch (CallToolRequest handler in @modelcontextprotocol/sdk) catches
 * thrown errors and converts them into `{ isError: true, content: [...] }` — mirror
 * that here so tests see the same shape regardless of whether a given tool wraps its
 * body in `mcpRun` or lets ownership errors propagate.
 */
async function callTool(userId: string | null, name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const { createServer } = await import("../mcp/index");
    const server: McpServer = createServer({ userId, allowDestructive: true });
    const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<ToolResult> }> })._registeredTools;
    try {
        return await tools[name].handler(args);
    } catch (e) {
        return { isError: true, content: [{ text: e instanceof Error ? e.message : String(e) }] };
    }
}

async function createUser(id: string) {
    return prisma.user.create({ data: { id, email: `${id}@test.com`, googleId: `google-${id}` } });
}

describe("MCP cross-tenant access (SEC-02)", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await createUser("owner-a");
        await createUser("owner-b");
    });

    describe("annotations", () => {
        async function setup() {
            const project = await prisma.project.create({ data: { title: "P", userId: "owner-a" } });
            const node = await prisma.structureNode.create({ data: { projectId: project.id, type: "SCENE", title: "S1" } });
            const annotation = await prisma.annotation.create({ data: { nodeId: node.id, content: "note" } });
            return { project, node, annotation };
        }

        it("denies update/delete/resolve of another user's annotation", async () => {
            const { annotation } = await setup();
            for (const [tool, args] of [
                ["update_annotation", { annotationId: annotation.id, content: "hijacked" }],
                ["delete_annotation", { annotationId: annotation.id }],
                ["resolve_annotation", { annotationId: annotation.id, resolved: true }],
            ] as const) {
                const result = await callTool("owner-b", tool, args);
                expect(result.isError).toBe(true);
                expect(result.content[0].text).toContain("access denied");
            }
        });

        it("allows the owner to update/resolve their own annotation", async () => {
            const { annotation } = await setup();
            const result = await callTool("owner-a", "resolve_annotation", { annotationId: annotation.id, resolved: true });
            expect(result.isError).toBeUndefined();
        });

        it("get_open_annotations with no projectId scopes to the caller's own projects", async () => {
            const { annotation: annotationA } = await setup();
            const projectB = await prisma.project.create({ data: { title: "PB", userId: "owner-b" } });
            const nodeB = await prisma.structureNode.create({ data: { projectId: projectB.id, type: "SCENE", title: "S1" } });
            await prisma.annotation.create({ data: { nodeId: nodeB.id, content: "b-note" } });

            const resultA = await callTool("owner-a", "get_open_annotations", {});
            expect(resultA.isError).toBeUndefined();
            const idsA = JSON.parse(resultA.content[0].text).map((a: { id: string }) => a.id);
            expect(idsA).toEqual([annotationA.id]);
            expect(idsA).not.toContain(undefined);

            const resultB = await callTool("owner-b", "get_open_annotations", {});
            const idsB = JSON.parse(resultB.content[0].text).map((a: { id: string }) => a.id);
            expect(idsB).not.toContain(annotationA.id);
        });

        it("denies get_open_annotations for another user's projectId", async () => {
            const { project } = await setup();
            const result = await callTool("owner-b", "get_open_annotations", { projectId: project.id });
            expect(result.isError).toBe(true);
        });
    });

    describe("relationships", () => {
        it("denies deleting a relationship owned by another user's project", async () => {
            const project = await prisma.project.create({ data: { title: "P", userId: "owner-a" } });
            const node = await prisma.structureNode.create({ data: { projectId: project.id, type: "SCENE", title: "S1" } });
            const rel = await prisma.relationship.create({ data: { type: "RELATED_TO", fromNodeId: node.id } });

            const result = await callTool("owner-b", "delete_relationship", { relationshipId: rel.id });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain("access denied");
        });

        it("allows the owner to delete their own relationship", async () => {
            const project = await prisma.project.create({ data: { title: "P", userId: "owner-a" } });
            const node = await prisma.structureNode.create({ data: { projectId: project.id, type: "SCENE", title: "S1" } });
            const rel = await prisma.relationship.create({ data: { type: "RELATED_TO", fromNodeId: node.id } });

            const result = await callTool("owner-a", "delete_relationship", { relationshipId: rel.id });
            expect(result.isError).toBeUndefined();
        });
    });

    describe("universes", () => {
        async function setupUniverse() {
            const universe = await prisma.universe.create({ data: { title: "U", userId: "owner-a" } });
            const worldObject = await prisma.worldObject.create({ data: { universeId: universe.id, type: "CHARACTER", name: "Hero" } });
            const entry = await prisma.worldObjectTimelineEntry.create({ data: { worldObjectId: worldObject.id, label: "Birth" } });
            return { universe, worldObject, entry };
        }

        it("list_universes only returns the caller's own universes", async () => {
            const { universe } = await setupUniverse();
            const resultA = await callTool("owner-a", "list_universes", {});
            const idsA = JSON.parse(resultA.content[0].text).map((u: { id: string }) => u.id);
            expect(idsA).toContain(universe.id);

            const resultB = await callTool("owner-b", "list_universes", {});
            const idsB = JSON.parse(resultB.content[0].text).map((u: { id: string }) => u.id);
            expect(idsB).not.toContain(universe.id);
        });

        it("denies get/update/delete of another user's universe", async () => {
            const { universe } = await setupUniverse();
            for (const [tool, args] of [
                ["get_universe", { universeId: universe.id }],
                ["update_universe", { universeId: universe.id, title: "Hijacked" }],
                ["delete_universe", { universeId: universe.id }],
            ] as const) {
                const result = await callTool("owner-b", tool, args);
                expect(result.isError).toBe(true);
                expect(result.content[0].text).toContain("access denied");
            }
        });

        it("denies world-object tools scoped to another user's universe", async () => {
            const { universe, worldObject } = await setupUniverse();
            for (const [tool, args] of [
                ["list_world_objects", { universeId: universe.id }],
                ["get_world_object", { objectId: worldObject.id }],
                ["create_world_object", { universeId: universe.id, type: "CHARACTER", name: "Intruder" }],
                ["update_world_object", { objectId: worldObject.id, name: "Hijacked" }],
                ["delete_world_object", { objectId: worldObject.id }],
            ] as const) {
                const result = await callTool("owner-b", tool, args);
                expect(result.isError).toBe(true);
                expect(result.content[0].text).toContain("access denied");
            }
        });

        it("denies timeline-entry tools scoped to another user's universe", async () => {
            const { worldObject, entry } = await setupUniverse();
            for (const [tool, args] of [
                ["add_timeline_entry", { worldObjectId: worldObject.id, label: "Intruder entry" }],
                ["update_timeline_entry", { entryId: entry.id, label: "Hijacked" }],
                ["delete_timeline_entry", { entryId: entry.id }],
                ["reorder_timeline_entries", { worldObjectId: worldObject.id, orderedIds: [entry.id] }],
            ] as const) {
                const result = await callTool("owner-b", tool, args);
                expect(result.isError).toBe(true);
                expect(result.content[0].text).toContain("access denied");
            }
        });

        it("allows the owner full access to their own universe and world objects", async () => {
            const { universe, worldObject, entry } = await setupUniverse();
            expect((await callTool("owner-a", "get_universe", { universeId: universe.id })).isError).toBeUndefined();
            expect((await callTool("owner-a", "get_world_object", { objectId: worldObject.id })).isError).toBeUndefined();
            expect((await callTool("owner-a", "update_timeline_entry", { entryId: entry.id, label: "Birthday" })).isError).toBeUndefined();
        });

        it("create_universe assigns ownership to the caller", async () => {
            const result = await callTool("owner-a", "create_universe", { title: "New Universe" });
            expect(result.isError).toBeUndefined();
            const created = JSON.parse(result.content[0].text);
            const row = await prisma.universe.findUnique({ where: { id: created.id } });
            expect(row?.userId).toBe("owner-a");
        });

        it("denies transferring a story object into another user's universe", async () => {
            const { universe } = await setupUniverse();
            const projectB = await prisma.project.create({ data: { title: "PB", userId: "owner-b" } });
            const storyObject = await prisma.storyObject.create({ data: { projectId: projectB.id, type: "CHARACTER", name: "B's Hero" } });

            const result = await callTool("owner-b", "transfer_story_object_to_universe", {
                storyObjectId: storyObject.id,
                universeId: universe.id,
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain("access denied");
        });

        it("denies linking another user's universe to a project the caller owns", async () => {
            const { universe } = await setupUniverse();
            const projectB = await prisma.project.create({ data: { title: "PB", userId: "owner-b" } });

            const result = await callTool("owner-b", "link_project_to_universe", {
                projectId: projectB.id,
                universeId: universe.id,
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain("access denied");
        });
    });

    describe("google docs", () => {
        it("forwards the caller's userId to GoogleAuthController", async () => {
            await callTool("owner-a", "google_auth_status", {});
            expect(GoogleAuthController.getStatus).toHaveBeenCalledWith("owner-a");

            await callTool("owner-a", "google_auth_disconnect", {});
            expect(GoogleAuthController.disconnect).toHaveBeenCalledWith("owner-a");

            await callTool("owner-a", "google_auth_callback", { code: "auth-code" });
            expect(GoogleAuthController.handleCallback).toHaveBeenCalledWith("auth-code", "", "owner-a");
        });

        it("denies exporting another user's project to Google Docs", async () => {
            const projectA = await prisma.project.create({ data: { title: "PA", userId: "owner-a" } });
            const result = await callTool("owner-b", "export_to_google_docs", {
                projectId: projectA.id,
                exportMode: "STORY_READER",
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain("access denied");
        });

        it("denies exporting another user's universe to Google Docs", async () => {
            const universe = await prisma.universe.create({ data: { title: "U", userId: "owner-a" } });
            const result = await callTool("owner-b", "export_to_google_docs", {
                universeId: universe.id,
                exportMode: "UNIVERSE",
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain("access denied");
        });

        it("tells the caller to reconnect when Google auth is missing", async () => {
            const projectA = await prisma.project.create({ data: { title: "PA", userId: "owner-a" } });
            const result = await callTool("owner-a", "export_to_google_docs", {
                projectId: projectA.id,
                exportMode: "STORY_READER",
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toBe("Export failed: Not authenticated");
        });

        it("tells the caller to retry when the mapped Google Doc was deleted", async () => {
            const projectA = await prisma.project.create({ data: { title: "PA", userId: "owner-a" } });
            const create = vi.spyOn(GoogleDocsApi, "createDocument").mockResolvedValue("doc-1");
            const replace = vi.spyOn(GoogleDocsApi, "replaceContent").mockRejectedValue(Object.assign(new Error("gone"), { code: 404 }));
            try {
                const result = await callTool("owner-a", "export_to_google_docs", {
                    projectId: projectA.id,
                    exportMode: "STORY_READER",
                });
                expect(result.isError).toBe(true);
                expect(result.content[0].text).toBe(
                    "Export failed: Google Doc not found. Mapping removed. Please try again to create a new doc.",
                );
                expect(await prisma.googleDocExport.count({ where: { projectId: projectA.id } })).toBe(0);
            } finally {
                create.mockRestore();
                replace.mockRestore();
            }
        });
    });
});
