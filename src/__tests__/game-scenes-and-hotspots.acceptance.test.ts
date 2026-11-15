// Acceptance tests for openspec/specs/game-scenes-and-hotspots (#1501), one per scenario. Each is
// `it.fails` until #1503 (and, for exported behavior, #1507) makes it pass; then it becomes `it`.
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

vi.mock("@/lib/api-auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-auth")>();
    return { ...actual, getCurrentUserId: vi.fn(() => null as string | null) };
});
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/storage/object-storage", async (importOriginal) =>
    (await import("./game-acceptance")).fakeStorage(await importOriginal()));

import { POST as ingestRoute } from "@/app/api/projects/[id]/locations/[slug]/snapshots/route";
import { locationSlugs } from "@/lib/location-snapshots/slug";
import { testPrisma } from "./setup";
import {
    CONTENT, COUNTER, DOOR, FLOOR, FLYER, app, appRefusal, json, model, room, seededGame,
    type Hotspot, type Room,
} from "./game-acceptance";

const streetWith = (...extra: Hotspot[]) => room("street", [FLYER, DOOR, ...extra]);

function hotspot(id: string, target: Hotspot["target"]): Hotspot {
    return { id, name: id, verb: "Look at", target, walkTo: { x: 640, y: 600 }, interactions: [{ verb: "look", effects: [{ say: `A ${id}.` }] }] };
}

/** A snapshot of the room's location, whose things are keyed by hotspot id. */
async function snapshot(projectId: string, storyObjectId: string, build: number, doorName: string): Promise<{ id: string }> {
    const locations = await testPrisma.storyObject.findMany({ where: { projectId, type: "LOCATION" }, select: { id: true, name: true } });
    const slug = [...locationSlugs(locations)].find(([, id]) => id === storyObjectId)![0];
    // A different picture each build, so a later snapshot is a new upload, not a repeat of the last.
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 136, b: 68 + build } } }).png().toBuffer();
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(png)], { type: "image/png" }));
    form.set("build", `build-${build}`);
    form.set("takenAt", `2026-11-0${build}T10:00:00Z`);
    form.set("things", JSON.stringify([
        { key: "door", name: doorName, description: "", kind: "exit", box: { x: 50, y: 0, w: 14, h: 48 } },
        { key: "flyer", name: "Flyer", description: "", kind: "hotspot", box: { x: 10, y: 20, w: 10, h: 10 } },
    ]));
    const res = await ingestRoute(
        new NextRequest(`http://localhost/api/projects/${projectId}/locations/${slug}/snapshots`, {
            method: "POST", headers: { "x-csrf-protection": "1" }, body: form,
        }),
        { params: Promise.resolve({ id: projectId, slug }) },
    );
    expect(res.status).toBe(201);
    return (await res.json()).snapshot;
}

describe("game-scenes-and-hotspots", () => {
    describe("Requirement: Rooms", () => {
        it.fails("Creating a room", async () => {
            const { game, projectId } = await seededGame();
            await game.save(projectId, "model", model("scene/cellar"));

            await game.save(projectId, "room", room("cellar", []));

            expect(await game.list(projectId, "room")).toContainEqual(expect.objectContaining({ id: "cellar", world: "street" }));
            const stairs: Hotspot = {
                ...hotspot("stairs", { node: "stairs" }),
                interactions: [{ verb: "go", effects: [{ goTo: "cellar", at: { x: 640, y: 600 } }] }],
            };
            await game.save(projectId, "room", streetWith(stairs));
        });

        it.fails("A floor that is not convex", async () => {
            const { game, projectId } = await seededGame();
            const dented = [FLOOR[0], { x: 640, y: 600 }, ...FLOOR.slice(1)];

            const reason = await game.saveRefusal(projectId, "room", room("street", [FLYER, DOOR], { walkable: dented, start: { x: 640, y: 615 } }));

            expect(reason).toContain("640");
            expect(reason).toContain("600");
        });
    });

    describe("Requirement: Hotspots", () => {
        it.fails("Placing a character", async () => {
            const { game, projectId } = await seededGame();
            const bar: Hotspot = {
                ...hotspot("bar", { entity: "bartender", at: { x: 500, y: 600 } }),
                interactions: [{ verb: "talk", effects: [{ say: "Hello.", by: "bartender" }] }],
            };

            await game.save(projectId, "room", streetWith(bar));

            const saved = (await game.get(projectId, "room", "street")).hotspots.find((h) => h.id === "bar");
            expect(saved).toEqual(bar);
            const { files } = await game.exportGame(projectId);
            const exported = json<Omit<Room, "id">>(files, `${CONTENT}/rooms/street.json`).hotspots.find((h) => h.id === "bar");
            expect(exported).toEqual(bar);
        });

        it.fails("A part of the scene", async () => {
            const { game, projectId } = await seededGame();

            await game.save(projectId, "room", streetWith(hotspot("window", { node: "window" })));

            const saved = (await game.get(projectId, "room", "street")).hotspots.find((h) => h.id === "window");
            expect(saved?.target).toEqual({ node: "window" });
        });

        it.fails("A duplicate id", async () => {
            const { game, projectId } = await seededGame();

            const rear: Hotspot = {
                ...hotspot("door", { node: "rear" }),
                name: "Rear exit",
                interactions: [{ verb: "look", effects: [{ say: "The way out back." }] }],
            };

            const reason = await game.saveRefusal(projectId, "room", streetWith(rear));

            expect(reason).toContain("door");
        });
    });

    describe("Requirement: Exits", () => {
        it.fails("Linking two rooms", async () => {
            const { game, projectId } = await seededGame();
            const out: Hotspot = {
                ...hotspot("out", { node: "out" }),
                interactions: [{ verb: "go", effects: [{ goTo: "street", at: { x: 1000, y: 600 } }] }],
            };

            await game.save(projectId, "room", room("shop", [COUNTER, out]));

            const { files } = await game.exportGame(projectId);
            const exit = json<Omit<Room, "id">>(files, `${CONTENT}/rooms/shop.json`).hotspots.find((h) => h.id === "out");
            expect(exit?.interactions).toEqual(out.interactions);
        });

        it.fails("An arrival off the floor", async () => {
            const { game, projectId } = await seededGame();
            const offFloor: Hotspot = { ...DOOR, interactions: [{ verb: "go", effects: [{ goTo: "shop", at: { x: 10, y: 10 } }] }] };

            const reason = await game.saveRefusal(projectId, "room", room("street", [FLYER, offFloor]));

            expect(reason).toContain("door");
            expect(reason).toContain("shop");
        });
    });

    describe("Requirement: Model registry", () => {
        it.fails("Adding a model", async () => {
            const { game, projectId } = await seededGame();
            const artSpec = { prompt: "A crow in a police cap", notes: "Stern, but tired.", referenceImages: [] };

            await game.save(projectId, "model", model("character/cop", { height: 1.7, artSpec, status: "placeholder", fileData: undefined }));

            expect(await game.list(projectId, "model")).toContainEqual(
                expect.objectContaining({ id: "character/cop", kind: "character", height: 1.7, artSpec, status: "placeholder", placeholder: true }),
            );
            await game.save(projectId, "character", { id: "cop", name: "Cop", model: "character/cop" });
        });

        it.fails("Replacing a placeholder", async () => {
            const { game, projectId } = await seededGame();
            await game.save(projectId, "model", model("scene/cellar", { status: "placeholder", fileData: undefined }));
            await game.save(projectId, "room", room("cellar", []));
            const before = await game.get(projectId, "room", "cellar");

            await game.save(projectId, "model", model("scene/cellar"));

            expect(await game.get(projectId, "model", "scene/cellar")).toMatchObject({ status: "final", placeholder: false });
            expect(await game.get(projectId, "room", "cellar")).toEqual(before);
        });

        it.fails("A model of the wrong kind", async () => {
            const { game, projectId } = await seededGame();

            const reason = await game.saveRefusal(projectId, "room", room("street", [FLYER, DOOR], { model: "character/bartender" }));

            expect(reason).toContain("character/bartender");
        });
    });

    describe("Requirement: Map and snapshots", () => {
        it.fails("A requested rename", async () => {
            const { game, projectId } = await seededGame();
            const { storyObjectId } = await game.get(projectId, "room", "street");
            const first = await snapshot(projectId, storyObjectId, 1, "Shop door");
            const request = await game.call<{ id: string }>("add_snapshot_annotation", {
                snapshotId: first.id, kind: "name", thingKey: "door", text: "Oak door",
            });

            const applied = await game.call<{ status: string }>("apply_snapshot_annotation", { annotationId: request.id });

            expect(applied.status).not.toBe("done");
            expect((await game.get(projectId, "room", "street")).hotspots.find((h) => h.id === "door")?.name).toBe("Oak door");
            const status = async () =>
                (await game.call<{ annotations: { id: string; status: string }[] }>("get_location_snapshot", { storyObjectId }))
                    .annotations.find((a) => a.id === request.id)?.status;
            await snapshot(projectId, storyObjectId, 2, "Shop door");
            expect(await status()).not.toBe("done");
            await snapshot(projectId, storyObjectId, 3, "Oak door");
            expect(await status()).toBe("done");
        });
    });

    describe("Requirement: Agent access", () => {
        it.fails("An agent adds a hotspot", async () => {
            const { game, projectId } = await seededGame();

            await game.save(projectId, "room", streetWith(hotspot("bench", { node: "bench" })));

            const street = (await app.objects(projectId, "room")).find((r) => r.id === "street");
            expect(street?.hotspots.map((h) => h.id)).toContain("bench");
            const duplicate = streetWith({ ...DOOR, name: "Back door" });
            expect(await game.saveRefusal(projectId, "room", duplicate)).toBe(await appRefusal(projectId, "room", duplicate));
        });
    });
});
