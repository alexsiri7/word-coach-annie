import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-auth")>();
    return { ...actual, getCurrentUserId: vi.fn(() => null as string | null) };
});

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getCurrentUserId } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { StoryObjectController } from "@/lib/controllers/story-objects";
import { UniversesController } from "@/lib/controllers/universes";
import { LocationMapController } from "@/lib/controllers/location-maps";
import { GET, PUT, DELETE } from "@/app/api/story-objects/[id]/map/route";

const OWNER = "map-owner";
const STRANGER = "map-stranger";

async function setup(type = "LOCATION") {
    const project = await prisma.project.create({ data: { title: "P", userId: OWNER } });
    const location = await prisma.storyObject.create({ data: { projectId: project.id, type, name: "Sunstone Keep" } });
    return { project, location };
}

function request(id: string, method: string, body?: unknown) {
    return new NextRequest(`http://localhost/api/story-objects/${id}/map`, {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (id: string) => GET(request(id, "GET"), params(id));
const put = (id: string, body: unknown) => PUT(request(id, "PUT", body), params(id));
const remove = (id: string) => DELETE(request(id, "DELETE"), params(id));

async function putOk(id: string, body: unknown) {
    const res = await put(id, body);
    const json = await res.json();
    expect(res.status, json.error).toBe(200);
    return json.data;
}

const map = (items: unknown[], extra: Record<string, unknown> = {}) => ({ widthM: 12, heightM: 8, items, ...extra });

describe("location map", () => {
    beforeEach(async () => {
        await prisma.user.create({ data: { id: OWNER, email: "owner@test.com", googleId: "g-owner" } });
        await prisma.user.create({ data: { id: STRANGER, email: "stranger@test.com", googleId: "g-stranger" } });
        vi.mocked(getCurrentUserId).mockReturnValue(OWNER);
    });

    it("has no map until one is saved, then reads back what was saved", async () => {
        const { location } = await setup();
        expect(await (await get(location.id)).json()).toEqual({ data: null });

        await putOk(location.id, map([
            { id: "bar", kind: "object", label: "Bar <b>top</b>", description: "Oak", x: 3, y: 2, w: 4, h: 1, rotation: 370 },
            { id: "yard", kind: "area", x: 8, y: 5, w: 4, h: 2, points: [[-2, -1], [2, -1], [2, 1], [-2, 1]] },
            { id: "pin", kind: "note", label: "Cold draught", x: 1, y: 7, w: 0.4, h: 0.4 },
        ]));

        const { data } = await (await get(location.id)).json();
        expect(data).toMatchObject({ storyObjectId: location.id, widthM: 12, heightM: 8, backgroundImageId: null });
        expect(data.contentHash).toMatch(/^[0-9a-f]{64}$/);
        expect(data.items).toEqual([
            { id: "bar", kind: "object", label: "Bar top", description: "Oak", x: 3, y: 2, w: 4, h: 1, rotation: 10, linkName: null, unlinked: false },
            { id: "yard", kind: "area", label: "", description: "", x: 8, y: 5, w: 4, h: 2, rotation: 0, points: [[-2, -1], [2, -1], [2, 1], [-2, 1]], linkName: null, unlinked: false },
            { id: "pin", kind: "note", label: "Cold draught", description: "", x: 1, y: 7, w: 0.4, h: 0.4, rotation: 0, linkName: null, unlinked: false },
        ]);
    });

    it("refuses an invalid map and stores nothing", async () => {
        const { location } = await setup();
        const res = await put(location.id, map([{ id: "x", kind: "door", x: 1, y: 1, w: 1, h: 1 }]));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/^items\.0\.kind: /);

        const bad = await put(location.id, "not a map");
        expect(bad.status).toBe(400);
        expect(await prisma.locationMap.count()).toBe(0);
    });

    it("refuses text that sanitizing escapes past its length limit, and stores nothing", async () => {
        const { location } = await setup();
        const label = "x<3".repeat(33) + "x";
        const res = await put(location.id, map([{ id: "n", kind: "note", label, x: 1, y: 1, w: 0.4, h: 0.4 }]));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/^items\.0\.label: /);
        expect(await prisma.locationMap.count()).toBe(0);
    });

    it("refuses a map on a story object that is not a location", async () => {
        const { location: character } = await setup("CHARACTER");
        const res = await put(character.id, map([]));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe("Maps can only be attached to locations");
        expect((await get(character.id)).status).toBe(400);
        expect((await get("missing")).status).toBe(404);
    });

    describe("links", () => {
        it("follows a rename, and keeps an unlinked item when the target is deleted", async () => {
            const { project, location } = await setup();
            const kael = await prisma.storyObject.create({ data: { projectId: project.id, type: "CHARACTER", name: "Kael" } });
            await putOk(location.id, map([{ id: "k", kind: "character", label: "guard", x: 2, y: 2, w: 0.6, h: 0.6, storyObjectId: kael.id }]));
            expect((await (await get(location.id)).json()).data.items[0]).toMatchObject({ linkName: "Kael", unlinked: false });

            await StoryObjectController.updateStoryObject(kael.id, { name: "Kael the Bold" });
            expect((await (await get(location.id)).json()).data.items[0]).toMatchObject({ linkName: "Kael the Bold", unlinked: false });

            await StoryObjectController.deleteStoryObject(kael.id);
            const { data } = await (await get(location.id)).json();
            expect(data.items[0]).toMatchObject({ id: "k", label: "guard", storyObjectId: kael.id, linkName: null, unlinked: true });

            // What the editor read back, unlinked item included, saves again unchanged.
            await putOk(location.id, data);
            // A new item may not point at the deleted character.
            const res = await put(location.id, map([...data.items, { id: "k2", kind: "character", x: 1, y: 1, w: 1, h: 1, storyObjectId: kael.id }]));
            expect(res.status).toBe(400);
        });

        it("resolves an exit's target location", async () => {
            const { project, location } = await setup();
            const hall = await prisma.storyObject.create({ data: { projectId: project.id, type: "LOCATION", name: "Throne Room" } });
            const data = await putOk(location.id, map([{ id: "door", kind: "exit", x: 0, y: 4, w: 1, h: 0.3, targetLocationId: hall.id }]));
            expect(data.items[0]).toMatchObject({ targetLocationId: hall.id, linkName: "Throne Room", unlinked: false });
        });

        it.each([
            ["a character linked to a location", "character", "storyObjectId", "LOCATION", "Item i: storyObjectId must be a CHARACTER in this project"],
            ["an object linked to a character", "object", "storyObjectId", "CHARACTER", "Item i: storyObjectId must be a WORLD_ELEMENT in this project"],
            ["an exit linked to a character", "exit", "targetLocationId", "CHARACTER", "Item i: targetLocationId must be a LOCATION in this project"],
        ])("refuses %s", async (_label, kind, field, targetType, message) => {
            const { project, location } = await setup();
            const target = await prisma.storyObject.create({ data: { projectId: project.id, type: targetType, name: "T" } });
            const res = await put(location.id, map([{ id: "i", kind, x: 1, y: 1, w: 1, h: 1, [field]: target.id }]));
            expect(res.status).toBe(400);
            expect((await res.json()).error).toBe(message);
        });

        it("checks a kept link again when its item changes kind", async () => {
            const { project, location } = await setup();
            const well = await prisma.storyObject.create({ data: { projectId: project.id, type: "WORLD_ELEMENT", name: "Well" } });
            await putOk(location.id, map([{ id: "w", kind: "object", x: 1, y: 1, w: 1, h: 1, storyObjectId: well.id }]));

            const res = await put(location.id, map([{ id: "w", kind: "exit", x: 1, y: 1, w: 1, h: 0.3, targetLocationId: well.id }]));
            expect(res.status).toBe(400);
            expect((await res.json()).error).toBe("Item w: targetLocationId must be a LOCATION in this project");
        });

        it("refuses a link to another project's story object", async () => {
            const { location } = await setup();
            const other = await prisma.project.create({ data: { title: "Other", userId: STRANGER } });
            const theirs = await prisma.storyObject.create({ data: { projectId: other.id, type: "CHARACTER", name: "Secret" } });
            const res = await put(location.id, map([{ id: "i", kind: "character", x: 1, y: 1, w: 1, h: 1, storyObjectId: theirs.id }]));
            expect(res.status).toBe(400);
        });
    });

    // Node is single-threaded, so the two transactions are interleaved rather than
    // truly simultaneous; a loser fails with P2034 instead of overwriting the winner.
    it("keeps every item that concurrent upserts report as saved", async () => {
        const { location } = await setup();
        await putOk(location.id, map([]));

        const results = await Promise.allSettled(["a", "b"].map((id) =>
            LocationMapController.upsertItem(location.id, { id, kind: "note", label: "", description: "", x: 1, y: 1, w: 0.4, h: 0.4, rotation: 0 }),
        ));

        const stored = await prisma.locationMap.findUniqueOrThrow({ where: { storyObjectId: location.id } });
        const storedIds = (stored.items as Array<{ id: string }>).map((item) => item.id);
        const savedIds = results.flatMap((r) => (r.status === "fulfilled" ? [r.value.item.id] : []));
        expect(savedIds.length).toBeGreaterThan(0);
        expect(storedIds).toEqual(expect.arrayContaining(savedIds));
        for (const r of results) {
            if (r.status === "rejected") expect(String(r.reason)).toContain("changed at the same time");
        }
    });

    describe("background", () => {
        async function image(storyObjectId: string) {
            return prisma.locationImage.create({
                data: { storyObjectId, storagePath: "p/full.webp", thumbPath: "p/thumb.webp", width: 1, height: 1, bytes: 1, sha256: "s" },
            });
        }

        it("takes one of the location's images, and is cleared when that image is deleted", async () => {
            const { location } = await setup();
            const plan = await image(location.id);
            expect(await putOk(location.id, map([], { backgroundImageId: plan.id }))).toMatchObject({ backgroundImageId: plan.id });

            await prisma.locationImage.delete({ where: { id: plan.id } });
            expect((await (await get(location.id)).json()).data.backgroundImageId).toBeNull();
        });

        it("refuses another location's image", async () => {
            const { project, location } = await setup();
            const elsewhere = await prisma.storyObject.create({ data: { projectId: project.id, type: "LOCATION", name: "Elsewhere" } });
            const theirs = await image(elsewhere.id);
            const res = await put(location.id, map([], { backgroundImageId: theirs.id }));
            expect(res.status).toBe(400);
            expect((await res.json()).error).toBe("backgroundImageId must be one of this location's images");
        });
    });

    describe("another user", () => {
        it.each([
            ["with no share", null],
            ["holding a READER share", "READER"],
            ["holding an EDITOR share", "EDITOR"],
        ])("cannot read or change a map %s", async (_label, role) => {
            const { project, location } = await setup();
            await putOk(location.id, map([]));
            if (role) await prisma.projectShare.create({ data: { projectId: project.id, email: "stranger@test.com", role } });
            vi.mocked(getCurrentUserId).mockReturnValue(STRANGER);

            expect((await get(location.id)).status).toBe(403);
            expect((await put(location.id, map([], { widthM: 99 }))).status).toBe(403);
            expect((await remove(location.id)).status).toBe(403);
            expect(await prisma.locationMap.findUniqueOrThrow({ where: { storyObjectId: location.id } })).toMatchObject({ widthM: 12 });
        });
    });

    describe("removal", () => {
        it("deletes the map over REST, and 404s when there is none", async () => {
            const { location } = await setup();
            await putOk(location.id, map([]));
            const res = await remove(location.id);
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ deleted: true });
            expect((await remove(location.id)).status).toBe(404);
        });

        it("goes with its location", async () => {
            const { location } = await setup();
            await putOk(location.id, map([]));
            await StoryObjectController.deleteStoryObject(location.id);
            expect(await prisma.locationMap.count()).toBe(0);
        });

        it("refuses to move a location with a map to the universe", async () => {
            const { project, location } = await setup();
            const universe = await prisma.universe.create({ data: { title: "U", userId: OWNER } });
            await prisma.project.update({ where: { id: project.id }, data: { universeId: universe.id } });
            await putOk(location.id, map([]));

            await expect(UniversesController.transferStoryObjectToUniverse(location.id, universe.id))
                .rejects.toThrow("Remove this location's map before moving it to the universe");
            expect(await prisma.storyObject.count({ where: { id: location.id } })).toBe(1);
            expect(await prisma.worldObject.count()).toBe(0);
        });
    });
});
