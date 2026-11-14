import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/db";

vi.mock("../lib/controllers/google-auth", () => ({
    GoogleAuthController: {
        getStatus: vi.fn(async () => ({ connected: false })),
        getAuthUrl: vi.fn(() => "https://example.com/auth"),
        handleCallback: vi.fn(async () => ({})),
        disconnect: vi.fn(async () => {}),
        getValidClient: vi.fn(async () => null),
    },
}));

vi.mock("@/lib/storage/supabase-storage", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/storage/supabase-storage")>();
    return {
        ...actual,
        uploadObject: vi.fn(async () => {}),
        createSignedUrls: vi.fn(async (paths: string[]) => new Map(paths.map((p) => [p, `https://storage.test/${p}?token=t`]))),
        removeObjects: vi.fn(async () => {}),
    };
});

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

    describe("location images", () => {
        const PNG_BASE64 =
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

        async function setupLocation() {
            const project = await prisma.project.create({ data: { title: "P", userId: "owner-a" } });
            const location = await prisma.storyObject.create({ data: { projectId: project.id, type: "LOCATION", name: "Harbour" } });
            const image = await prisma.locationImage.create({
                data: {
                    storyObjectId: location.id, storagePath: "secret/full.webp", thumbPath: "secret/thumb.webp",
                    width: 1, height: 1, bytes: 10, sha256: "abc", isCover: true,
                },
            });
            return { location, image };
        }

        it("denies every location image tool on another user's location", async () => {
            const { location, image } = await setupLocation();
            for (const [tool, args] of [
                ["list_location_images", { storyObjectId: location.id }],
                ["add_location_image", { storyObjectId: location.id, base64: PNG_BASE64 }],
                ["update_location_image", { imageId: image.id, caption: "hijacked" }],
                ["delete_location_image", { imageId: image.id }],
            ] as const) {
                const result = await callTool("owner-b", tool, args);
                expect(result.isError, tool).toBe(true);
                expect(result.content[0].text).toContain("access denied");
            }
            expect(await prisma.locationImage.findUniqueOrThrow({ where: { id: image.id } })).toMatchObject({ caption: "" });
        });

        it("lists signed URLs to the owner without storage paths as fields", async () => {
            const { location, image } = await setupLocation();
            const result = await callTool("owner-a", "list_location_images", { storyObjectId: location.id });
            expect(result.isError).toBeUndefined();
            const [listed] = JSON.parse(result.content[0].text);
            expect(listed).toMatchObject({
                id: image.id, sha256: "abc", bytes: 10, isCover: true,
                url: "https://storage.test/secret/full.webp?token=t",
                thumbUrl: "https://storage.test/secret/thumb.webp?token=t",
            });
            expect(listed).not.toHaveProperty("storagePath");
            expect(listed).not.toHaveProperty("thumbPath");
        });

        it("adds an image from base64 with a data URL prefix", async () => {
            const { location } = await setupLocation();
            const result = await callTool("owner-a", "add_location_image", {
                storyObjectId: location.id, base64: `data:image/png;base64,${PNG_BASE64}`, kind: "sketch", caption: "Plan",
            });
            expect(result.isError).toBeUndefined();
            expect(JSON.parse(result.content[0].text)).toMatchObject({ kind: "sketch", caption: "Plan", orderIndex: 1, isCover: false });
        });

        it("requires exactly one of url or base64", async () => {
            const { location } = await setupLocation();
            for (const args of [{}, { url: "https://example.com/a.png", base64: PNG_BASE64 }]) {
                const result = await callTool("owner-a", "add_location_image", { storyObjectId: location.id, ...args });
                expect(result.isError).toBe(true);
                expect(result.content[0].text).toContain("Provide exactly one of url or base64");
            }
        });

        it("gates delete_location_image behind MCP_ALLOW_DESTRUCTIVE", async () => {
            const { image } = await setupLocation();
            const { createServer } = await import("../mcp/index");
            const server = createServer({ userId: "owner-a", allowDestructive: false });
            const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<ToolResult> }> })._registeredTools;
            const result = await tools.delete_location_image.handler({ imageId: image.id });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain("MCP_ALLOW_DESTRUCTIVE");
            expect(await prisma.locationImage.count({ where: { id: image.id } })).toBe(1);
        });
    });

    describe("location maps", () => {
        const bar = { id: "bar", kind: "object", x: 3, y: 2, w: 4, h: 1 };

        async function setupMap() {
            const project = await prisma.project.create({ data: { title: "P", userId: "owner-a" } });
            const location = await prisma.storyObject.create({ data: { projectId: project.id, type: "LOCATION", name: "Harbour" } });
            await prisma.locationMap.create({ data: { storyObjectId: location.id, widthM: 12, heightM: 8, items: [bar] } });
            return { project, location };
        }

        async function readMap(storyObjectId: string) {
            const result = await callTool("owner-a", "get_location_map", { storyObjectId });
            expect(result.isError).toBeUndefined();
            return JSON.parse(result.content[0].text);
        }

        it("denies every location map tool on another user's location", async () => {
            const { location } = await setupMap();
            for (const [tool, args] of [
                ["get_location_map", { storyObjectId: location.id }],
                ["set_location_map", { storyObjectId: location.id, map: { widthM: 1, heightM: 1, items: [] } }],
                ["upsert_location_map_item", { storyObjectId: location.id, item: { ...bar, label: "hijacked" } }],
                ["delete_location_map_item", { storyObjectId: location.id, itemId: "bar" }],
            ] as const) {
                const result = await callTool("owner-b", tool, args);
                expect(result.isError, tool).toBe(true);
                expect(result.content[0].text).toContain("access denied");
            }
            expect(await prisma.locationMap.findUniqueOrThrow({ where: { storyObjectId: location.id } })).toMatchObject({ widthM: 12, items: [bar] });
        });

        it("refuses an invalid map with the schema's message", async () => {
            const project = await prisma.project.create({ data: { title: "P", userId: "owner-a" } });
            const location = await prisma.storyObject.create({ data: { projectId: project.id, type: "LOCATION", name: "Inn" } });
            const result = await callTool("owner-a", "set_location_map", {
                storyObjectId: location.id,
                map: { widthM: 12, heightM: 8, items: [{ id: "a", kind: "area", x: 1, y: 1, w: 1, h: 1 }] },
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain("items.0.points: points are required on area items");
            expect(await prisma.locationMap.count()).toBe(0);
        });

        it("creates a map without a contentHash but replaces one only with the current hash", async () => {
            const { location } = await setupMap();
            const next = { widthM: 20, heightM: 10, items: [] };

            const missing = await callTool("owner-a", "set_location_map", { storyObjectId: location.id, map: next });
            expect(missing.isError).toBe(true);
            expect(missing.content[0].text).toContain("pass its contentHash");

            const stale = await callTool("owner-a", "set_location_map", { storyObjectId: location.id, map: next, contentHash: "0".repeat(64) });
            expect(stale.isError).toBe(true);
            expect(stale.content[0].text).toContain("Stale write rejected");

            const { contentHash } = await readMap(location.id);
            const ok = await callTool("owner-a", "set_location_map", { storyObjectId: location.id, map: next, contentHash });
            expect(ok.isError).toBeUndefined();
            expect(JSON.parse(ok.content[0].text)).toMatchObject({ widthM: 20, items: [] });
        });

        it("appends an item without an id and replaces one with an existing id in place", async () => {
            const { location } = await setupMap();
            const added = await callTool("owner-a", "upsert_location_map_item", {
                storyObjectId: location.id, item: { kind: "note", label: "Draughty", x: 1, y: 1, w: 0.4, h: 0.4 },
            });
            expect(added.isError).toBeUndefined();
            const newId = JSON.parse(added.content[0].text).item.id;
            expect(newId).toMatch(/^[0-9a-f-]{36}$/);

            const replaced = await callTool("owner-a", "upsert_location_map_item", {
                storyObjectId: location.id, item: { ...bar, label: "Long bar", w: 6 },
            });
            expect(replaced.isError).toBeUndefined();
            expect((await readMap(location.id)).items.map((i: { id: string; label: string; w: number }) => [i.id, i.label, i.w]))
                .toEqual([["bar", "Long bar", 6], [newId, "Draughty", 0.4]]);
        });

        it("deletes one item, and says so when it is not there", async () => {
            const { location } = await setupMap();
            const result = await callTool("owner-a", "delete_location_map_item", { storyObjectId: location.id, itemId: "bar" });
            expect(result.isError).toBeUndefined();
            expect((await readMap(location.id)).items).toEqual([]);

            const again = await callTool("owner-a", "delete_location_map_item", { storyObjectId: location.id, itemId: "bar" });
            expect(again.isError).toBe(true);
            expect(again.content[0].text).toContain("Map item not found");
        });

        it("gates delete_location_map_item behind MCP_ALLOW_DESTRUCTIVE", async () => {
            const { location } = await setupMap();
            const { createServer } = await import("../mcp/index");
            const server = createServer({ userId: "owner-a", allowDestructive: false });
            const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<ToolResult> }> })._registeredTools;
            const result = await tools.delete_location_map_item.handler({ storyObjectId: location.id, itemId: "bar" });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain("MCP_ALLOW_DESTRUCTIVE");
            expect(await prisma.locationMap.findUniqueOrThrow({ where: { storyObjectId: location.id } })).toMatchObject({ items: [bar] });
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
