import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

vi.mock("@/lib/api-auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-auth")>();
    return { ...actual, getCurrentUserId: vi.fn(() => null as string | null) };
});

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const stored = new Map<string, Buffer>();
vi.mock("@/lib/storage/supabase-storage", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/storage/supabase-storage")>();
    return {
        ...actual,
        uploadObject: vi.fn(async (path: string, data: Buffer) => { stored.set(path, data); }),
        createSignedUrl: vi.fn(async (path: string) => `https://storage.test/signed/${path}?token=t`),
        createSignedUrls: vi.fn(async (paths: string[]) => new Map(paths.map((p) => [p, `https://storage.test/signed/${p}?token=t`]))),
        removeObjects: vi.fn(async (paths: string[]) => { for (const p of paths) stored.delete(p); }),
    };
});

import { getCurrentUserId } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { removeObjects, uploadObject } from "@/lib/storage/supabase-storage";
import { UniversesController } from "@/lib/controllers/universes";
import { IMAGE_FILE_CACHE_SECONDS } from "@/lib/controllers/location-images";
import { MAX_SNAPSHOTS_PER_LOCATION } from "@/lib/controllers/location-snapshots";
import { POST as ingestRoute } from "@/app/api/projects/[id]/locations/[slug]/snapshots/route";
import { GET as listRoute } from "@/app/api/story-objects/[id]/snapshots/route";
import { GET as getRoute } from "@/app/api/location-snapshots/[id]/route";
import { GET as fileRoute } from "@/app/api/location-snapshots/[id]/file/route";
import { POST as annotateRoute } from "@/app/api/location-snapshots/[id]/annotations/route";
import { PATCH as patchRoute, DELETE as deleteRoute } from "@/app/api/snapshot-annotations/[id]/route";
import { DELETE as deleteStoryObject } from "@/app/api/story-objects/[id]/route";
import { DELETE as deleteProject } from "@/app/api/projects/[id]/route";

const OWNER = "snapshot-owner";
const STRANGER = "snapshot-stranger";

const LAMP = { key: "lamp", name: "Lamp", description: "An old lamp", kind: "hotspot", box: { x: 10, y: 20, w: 30, h: 40 } };
const DOOR = { key: "door", name: "Door", description: "", kind: "exit", box: { x: 50, y: 0, w: 14, h: 48 } };

let png: Buffer;
let otherPng: Buffer;

async function setup() {
    const project = await prisma.project.create({ data: { title: "P", userId: OWNER } });
    const location = await prisma.storyObject.create({ data: { projectId: project.id, type: "LOCATION", name: "Sunstone Keep" } });
    return { project, location };
}

interface IngestOptions {
    file?: Buffer | string;
    build?: string;
    takenAt?: string;
    things?: unknown;
    headers?: Record<string, string>;
}

function ingest(projectId: string, slug: string, options: IngestOptions = {}) {
    const form = new FormData();
    const file = options.file ?? png;
    form.set("file", typeof file === "string" ? file : new Blob([new Uint8Array(file)], { type: "image/png" }));
    form.set("build", options.build ?? "build-1");
    form.set("takenAt", options.takenAt ?? "2026-11-01T10:00:00Z");
    form.set("things", typeof options.things === "string" ? options.things : JSON.stringify(options.things ?? [LAMP, DOOR]));
    const req = new NextRequest(`http://localhost/api/projects/${projectId}/locations/${slug}/snapshots`, {
        method: "POST",
        headers: options.headers ?? { "x-csrf-protection": "1" },
        body: form,
    });
    return ingestRoute(req, { params: Promise.resolve({ id: projectId, slug }) });
}

async function ingestOk(projectId: string, options: IngestOptions = {}) {
    const res = await ingest(projectId, "sunstone-keep", options);
    expect(res.status).toBe(201);
    return (await res.json()).snapshot;
}

function jsonRequest(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
    return new NextRequest(`http://localhost${url}`, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const list = (locationId: string) => listRoute(jsonRequest(`/api/story-objects/${locationId}/snapshots`, "GET"), params(locationId));
const get = (id: string) => getRoute(jsonRequest(`/api/location-snapshots/${id}`, "GET"), params(id));
const file = (id: string) => fileRoute(jsonRequest(`/api/location-snapshots/${id}/file`, "GET"), params(id));
const annotate = (snapshotId: string, body: unknown) =>
    annotateRoute(jsonRequest(`/api/location-snapshots/${snapshotId}/annotations`, "POST", body, { "x-csrf-protection": "1" }), params(snapshotId));
const patch = (id: string, body: unknown) => patchRoute(jsonRequest(`/api/snapshot-annotations/${id}`, "PATCH", body), params(id));
const remove = (id: string) => deleteRoute(jsonRequest(`/api/snapshot-annotations/${id}`, "DELETE"), params(id));

describe("location snapshots", () => {
    beforeEach(async () => {
        stored.clear();
        png ??= await sharp({ create: { width: 64, height: 48, channels: 3, background: "#c84" } }).png().toBuffer();
        otherPng ??= await sharp({ create: { width: 64, height: 48, channels: 3, background: "#48c" } }).png().toBuffer();
        await prisma.user.create({ data: { id: OWNER, email: "owner@test.com", googleId: "g-owner" } });
        await prisma.user.create({ data: { id: STRANGER, email: "stranger@test.com", googleId: "g-stranger" } });
        vi.mocked(getCurrentUserId).mockReturnValue(OWNER);
    });

    describe("ingest", () => {
        it("accepts a snapshots token without the CSRF header and stores the re-encoded screenshot", async () => {
            const { project, location } = await setup();
            const res = await ingest(project.id, "sunstone-keep", { headers: { "x-token-scope": "snapshots" } });
            expect(res.status).toBe(201);
            const { created, snapshot } = await res.json();

            expect(created).toBe(true);
            expect(snapshot).toMatchObject({
                storyObjectId: location.id,
                build: "build-1",
                takenAt: "2026-11-01T10:00:00.000Z",
                width: 64,
                height: 48,
                things: [DOOR, LAMP],
                imageUrl: `/api/location-snapshots/${snapshot.id}/file`,
            });
            expect(snapshot).not.toHaveProperty("storagePath");
            const row = await prisma.locationSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } });
            expect(row.storagePath).toMatch(new RegExp(`^${project.id}/${location.id}/snapshots/[0-9a-f-]+\\.webp$`));
            expect((await sharp(stored.get(row.storagePath)!).metadata()).format).toBe("webp");
        });

        it("requires the CSRF header from any other caller", async () => {
            const { project } = await setup();
            expect((await ingest(project.id, "sunstone-keep", { headers: {} })).status).toBe(403);
            expect(await prisma.locationSnapshot.count()).toBe(0);
        });

        it("refuses another user's project and a missing project", async () => {
            const { project } = await setup();
            vi.mocked(getCurrentUserId).mockReturnValue(STRANGER);
            expect((await ingest(project.id, "sunstone-keep", { headers: { "x-token-scope": "snapshots" } })).status).toBe(403);
            expect((await ingest("missing", "sunstone-keep")).status).toBe(404);
            expect(uploadObject).not.toHaveBeenCalled();
            expect(await prisma.locationSnapshot.count()).toBe(0);
        });

        it("answers an unknown slug with 404 and the known slugs, creating nothing", async () => {
            const { project } = await setup();
            await prisma.storyObject.create({ data: { projectId: project.id, type: "LOCATION", name: "The Docks" } });
            await prisma.storyObject.create({ data: { projectId: project.id, type: "CHARACTER", name: "Mara" } });

            const res = await ingest(project.id, "nowhere");
            expect(res.status).toBe(404);
            expect(await res.json()).toEqual({ error: "Unknown location", knownSlugs: ["sunstone-keep", "the-docks"] });
            expect(uploadObject).not.toHaveBeenCalled();
            expect(await prisma.locationSnapshot.count()).toBe(0);
        });

        it("tells duplicate location names apart as the export does", async () => {
            const { project } = await setup();
            await prisma.storyObject.create({ data: { id: "dock-a", projectId: project.id, type: "LOCATION", name: "Dock" } });
            const second = await prisma.storyObject.create({ data: { id: "dock-b", projectId: project.id, type: "LOCATION", name: "Dock" } });

            const res = await ingest(project.id, "dock-2");
            expect(res.status).toBe(201);
            expect((await res.json()).snapshot.storyObjectId).toBe(second.id);
        });

        it("stores one snapshot when the same upload is posted twice", async () => {
            const { project, location } = await setup();
            const first = await ingestOk(project.id);

            // Same file and things, listed in another order with keys reordered: still identical.
            const reordered = [{ box: DOOR.box, kind: DOOR.kind, description: "", name: "Door", key: "door" }, LAMP];
            const res = await ingest(project.id, "sunstone-keep", { build: "build-2", things: reordered });
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({ created: false, snapshot: { id: first.id, build: "build-1" } });
            expect(uploadObject).toHaveBeenCalledTimes(1);
            expect(await prisma.locationSnapshot.count({ where: { storyObjectId: location.id } })).toBe(1);
        });

        it("stores a new snapshot when only the things or only the file changed", async () => {
            const { project, location } = await setup();
            await ingestOk(project.id);
            await ingestOk(project.id, { things: [{ ...LAMP, description: "A new lamp" }, DOOR] });
            await ingestOk(project.id, { file: otherPng, things: [{ ...LAMP, description: "A new lamp" }, DOOR] });
            expect(await prisma.locationSnapshot.count({ where: { storyObjectId: location.id } })).toBe(3);
        });

        it("keeps the newest snapshots and the notes of deleted ones as text", async () => {
            const { project, location } = await setup();
            const oldest = await ingestOk(project.id, { build: "v0", things: [{ ...LAMP, description: "v0" }] });
            const note = await (await annotate(oldest.id, { kind: "note", text: "Too dark here", region: { type: "point", x: 5, y: 5 } })).json();
            const oldestPath = (await prisma.locationSnapshot.findUniqueOrThrow({ where: { id: oldest.id } })).storagePath;

            for (let i = 1; i <= MAX_SNAPSHOTS_PER_LOCATION + 1; i++) {
                await ingestOk(project.id, { build: `v${i}`, things: [{ ...LAMP, description: `v${i}` }] });
            }

            const rows = await prisma.locationSnapshot.findMany({ where: { storyObjectId: location.id }, orderBy: { createdAt: "asc" } });
            expect(rows.map((r) => r.build)).toEqual(["v2", "v3", "v4", "v5", "v6", "v7", "v8", "v9", "v10", "v11"]);
            expect(stored.has(oldestPath)).toBe(false);
            expect(stored.size).toBe(MAX_SNAPSHOTS_PER_LOCATION);
            expect(await prisma.snapshotAnnotation.findUniqueOrThrow({ where: { id: note.id } }))
                .toMatchObject({ snapshotId: null, text: "Too dark here", locationId: location.id });
        });

        it.each([
            ["duplicate thing keys", { things: [LAMP, LAMP] }, "Thing keys must be unique"],
            ["things that are not JSON", { things: "not json" }, "things must be a JSON array"],
            ["a box with a negative width", { things: [{ ...LAMP, box: { x: 0, y: 0, w: -1, h: 1 } }] }, undefined],
            ["a missing build", { build: "" }, "build is required"],
            ["an invalid takenAt", { takenAt: "yesterday" }, "takenAt must be a date"],
            ["a missing file", { file: "not a file" }, "Attach the screenshot as file"],
            ["a non-image", { file: Buffer.from("hello") }, "Not a supported image"],
        ])("refuses %s and stores nothing", async (_label, options, error) => {
            const { project } = await setup();
            const res = await ingest(project.id, "sunstone-keep", options as IngestOptions);
            expect(res.status).toBe(400);
            if (error) expect((await res.json()).error).toBe(error);
            expect(uploadObject).not.toHaveBeenCalled();
            expect(await prisma.locationSnapshot.count()).toBe(0);
        });

        it("refuses a file over 20 MB with 413", async () => {
            const { project } = await setup();
            const res = await ingest(project.id, "sunstone-keep", { file: Buffer.alloc(20 * 1024 * 1024 + 1) });
            expect(res.status).toBe(413);
        });
    });

    describe("requested changes", () => {
        it("marks a description edit done once a later snapshot carries the same text", async () => {
            const { project } = await setup();
            const snapshot = await ingestOk(project.id);
            const res = await annotate(snapshot.id, { kind: "description", thingKey: "lamp", text: "A brass lamp,  dented." });
            expect(res.status).toBe(201);
            const edit = await res.json();
            expect(edit).toMatchObject({ kind: "description", thingKey: "lamp", status: "open", snapshotId: snapshot.id });

            await ingestOk(project.id, { things: [{ ...LAMP, description: "A copper lamp" }, DOOR] });
            expect((await prisma.snapshotAnnotation.findUniqueOrThrow({ where: { id: edit.id } })).status).toBe("open");

            await ingestOk(project.id, { things: [{ ...LAMP, description: "A brass lamp,\n dented." }, DOOR] });
            expect((await prisma.snapshotAnnotation.findUniqueOrThrow({ where: { id: edit.id } })).status).toBe("done");
        });

        it("updates the open request for a thing instead of adding a second", async () => {
            const { project } = await setup();
            const snapshot = await ingestOk(project.id);
            const first = await (await annotate(snapshot.id, { kind: "name", thingKey: "door", text: "Gate" })).json();
            const second = await (await annotate(snapshot.id, { kind: "name", thingKey: "door", text: "Iron gate" })).json();
            expect(second.id).toBe(first.id);
            expect(await prisma.snapshotAnnotation.findMany()).toMatchObject([{ text: "Iron gate", status: "open" }]);

            await patch(first.id, { status: "sent" });
            const third = await (await annotate(snapshot.id, { kind: "name", thingKey: "door", text: "Oak gate" })).json();
            expect(third.id).not.toBe(first.id);
        });

        it.each([
            ["an unknown thing", { kind: "description", thingKey: "window", text: "x" }],
            ["a region on an edit", { kind: "description", thingKey: "lamp", text: "x", region: { type: "point", x: 1, y: 1 } }],
            ["an empty note", { kind: "note", text: "  " }],
            ["a one-point path", { kind: "note", text: "x", region: { type: "path", points: [[1, 1]] } }],
        ])("refuses %s", async (_label, body) => {
            const { project } = await setup();
            const snapshot = await ingestOk(project.id);
            expect((await annotate(snapshot.id, body)).status).toBe(400);
            expect(await prisma.snapshotAnnotation.count()).toBe(0);
        });
    });

    describe("notes", () => {
        it("persists a circled note and reads it back with the location's snapshots", async () => {
            const { project, location } = await setup();
            const snapshot = await ingestOk(project.id);
            const linked = await prisma.storyObject.create({ data: { projectId: project.id, type: "CHARACTER", name: "Mara" } });
            const region = { type: "path", points: [[1, 2], [10, 2], [10, 12]] };

            const res = await annotate(snapshot.id, { kind: "note", text: "Mara <b>stands</b> here", region, storyObjectId: linked.id });
            expect(res.status).toBe(201);
            await annotate(snapshot.id, { kind: "description", thingKey: "lamp", text: "A brass lamp" });

            const body = await (await list(location.id)).json();
            expect(body.data).toEqual([expect.objectContaining({ id: snapshot.id, build: "build-1", thingCount: 2 })]);
            expect(body.annotations).toEqual([
                expect.objectContaining({ kind: "note", text: "Mara stands here", region, storyObjectId: linked.id, status: "open" }),
                expect.objectContaining({ kind: "description", thingKey: "lamp", text: "A brass lamp" }),
            ]);
            expect(JSON.stringify(body)).not.toContain("storagePath");
        });

        it("refuses to link a story object from another project", async () => {
            const { project } = await setup();
            const snapshot = await ingestOk(project.id);
            const other = await prisma.project.create({ data: { title: "Other", userId: OWNER } });
            const foreign = await prisma.storyObject.create({ data: { projectId: other.id, type: "CHARACTER", name: "X" } });

            const res = await annotate(snapshot.id, { kind: "note", text: "x", storyObjectId: foreign.id });
            expect(res.status).toBe(400);
            expect((await res.json()).error).toBe("Linked story object must be in this project");
        });

        it("resolves, unlinks and deletes a note", async () => {
            const { project } = await setup();
            const snapshot = await ingestOk(project.id);
            const linked = await prisma.storyObject.create({ data: { projectId: project.id, type: "CHARACTER", name: "Mara" } });
            const note = await (await annotate(snapshot.id, { kind: "note", text: "x", storyObjectId: linked.id })).json();

            expect(await (await patch(note.id, { status: "done", storyObjectId: null })).json())
                .toMatchObject({ status: "done", storyObjectId: null });
            expect((await patch(note.id, {})).status).toBe(400);
            expect((await remove(note.id)).status).toBe(200);
            expect(await prisma.snapshotAnnotation.count()).toBe(0);
            expect((await remove(note.id)).status).toBe(404);
        });

        it("refuses a region on a requested change", async () => {
            const { project } = await setup();
            const snapshot = await ingestOk(project.id);
            const edit = await (await annotate(snapshot.id, { kind: "description", thingKey: "lamp", text: "x" })).json();
            expect((await patch(edit.id, { region: { type: "point", x: 1, y: 1 } })).status).toBe(400);
        });
    });

    it("gets a snapshot and redirects its file to a signed URL", async () => {
        const { project } = await setup();
        const snapshot = await ingestOk(project.id);
        const row = await prisma.locationSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } });

        expect(await (await get(snapshot.id)).json()).toMatchObject({ id: snapshot.id, things: [DOOR, LAMP] });
        const res = await file(snapshot.id);
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(`https://storage.test/signed/${row.storagePath}?token=t`);
        expect(res.headers.get("cache-control")).toBe(`private, max-age=${IMAGE_FILE_CACHE_SECONDS}`);
    });

    it("refuses another user every snapshot and annotation route", async () => {
        const { project, location } = await setup();
        const snapshot = await ingestOk(project.id);
        const note = await (await annotate(snapshot.id, { kind: "note", text: "mine" })).json();
        vi.mocked(getCurrentUserId).mockReturnValue(STRANGER);

        expect((await list(location.id)).status).toBe(403);
        expect((await get(snapshot.id)).status).toBe(403);
        expect((await file(snapshot.id)).status).toBe(403);
        expect((await annotate(snapshot.id, { kind: "note", text: "theirs" })).status).toBe(403);
        expect((await patch(note.id, { text: "theirs" })).status).toBe(403);
        expect((await remove(note.id)).status).toBe(403);
        expect(await prisma.snapshotAnnotation.findMany()).toMatchObject([{ id: note.id, text: "mine" }]);
    });

    describe("deleting the parent", () => {
        it("removes snapshot files when the location is deleted", async () => {
            const { project, location } = await setup();
            await ingestOk(project.id);
            const res = await deleteStoryObject(jsonRequest(`/api/story-objects/${location.id}`, "DELETE"), params(location.id));
            expect(res.status).toBe(200);
            expect(stored.size).toBe(0);
            expect(await prisma.locationSnapshot.count()).toBe(0);
        });

        it("removes snapshot files when the project is deleted", async () => {
            const { project } = await setup();
            await ingestOk(project.id);
            const paths = (await prisma.locationSnapshot.findMany()).map((s) => s.storagePath);
            await prisma.project.update({ where: { id: project.id }, data: { archivedAt: new Date() } });

            const res = await deleteProject(jsonRequest(`/api/projects/${project.id}`, "DELETE", { confirmTitle: "P" }), params(project.id));
            expect(res.status).toBe(200);
            expect(removeObjects).toHaveBeenCalledWith(paths);
            expect(stored.size).toBe(0);
        });

        it("refuses to move a location with snapshots to the universe", async () => {
            const { project, location } = await setup();
            const universe = await prisma.universe.create({ data: { title: "U", userId: OWNER } });
            await prisma.project.update({ where: { id: project.id }, data: { universeId: universe.id } });
            await ingestOk(project.id);

            await expect(UniversesController.transferStoryObjectToUniverse(location.id, universe.id))
                .rejects.toThrow("This location has game snapshots and can't be moved to the universe");
            expect(await prisma.storyObject.count({ where: { id: location.id } })).toBe(1);
        });
    });
});
