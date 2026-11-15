// Acceptance tests for openspec/specs/game-world-model (#1501), one per scenario. Each is
// `it.fails` until #1502 (and, for exported behavior, #1507) makes it pass; then it becomes `it`.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api-auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-auth")>();
    return { ...actual, getCurrentUserId: vi.fn(() => null as string | null) };
});
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/storage/supabase-storage", async (importOriginal) =>
    (await import("./game-acceptance")).fakeStorage(await importOriginal()));

import {
    CONTENT, DOOR, EFFECT_NAMES, FLYER, PROTAGONIST, app, appRefusal, json, model, room, seededGame,
    type BundleFile, type Effect, type Hotspot, type Room, type World,
} from "./game-acceptance";

function hotspot(id: string, interactions: Hotspot["interactions"]): Hotspot {
    return { id, name: id, verb: "Look at", target: { node: id }, walkTo: { x: 640, y: 600 }, interactions };
}

const streetWith = (...extra: Hotspot[]) => room("street", [FLYER, DOOR, ...extra]);

/** The engine's room file: a room without its id, which is the file's name. */
const roomFile = (files: BundleFile[], id: string) => json<Omit<Room, "id">>(files, `${CONTENT}/rooms/${id}.json`);

describe("game-world-model", () => {
    describe("Requirement: Game objects", () => {
        it.fails("Adding an item", async () => {
            const { game, projectId } = await seededGame();

            await game.save(projectId, "item", { id: "guitar", name: "Guitar", noUse: "It won't play that." });

            expect(await game.list(projectId, "item")).toContainEqual(
                expect.objectContaining({ id: "guitar", name: "Guitar", noUse: "It won't play that." }),
            );
            const sign = hotspot("sign", [{ verb: "look", when: [{ has: "guitar" }], effects: [{ say: "A gig poster." }] }]);
            await game.save(projectId, "room", streetWith(sign));
            const street = await game.get(projectId, "room", "street");
            expect(street.hotspots.find((h) => h.id === "sign")?.interactions[0].when).toEqual([{ has: "guitar" }]);
        });

        it.fails("Deleting an object that is in use", async () => {
            const { game, projectId } = await seededGame();
            const inUse: { kind: "item" | "flag"; id: string; usedIn: { id: string; hotspot: string }[] }[] = [
                { kind: "item", id: "map", usedIn: [{ id: "street", hotspot: "flyer" }, { id: "shop", hotspot: "counter" }] },
                { kind: "flag", id: "door-open", usedIn: [{ id: "street", hotspot: "flyer" }, { id: "street", hotspot: "door" }] },
            ];

            for (const { kind, id, usedIn } of inUse) {
                const first = await game.call<{ deleted: boolean; usedBy: { kind: string; id: string; field: string }[] }>(
                    "delete_game_object", { projectId, kind, id },
                );

                expect(first.deleted).toBe(false);
                for (const use of usedIn) {
                    expect(first.usedBy).toContainEqual(
                        expect.objectContaining({ kind: "room", id: use.id, field: expect.stringContaining(`hotspots[${use.hotspot}]`) }),
                    );
                }
                expect((await game.list(projectId, kind)).map((o) => o.id)).toContain(id);

                const confirmed = await game.call<{ deleted: boolean }>("delete_game_object", { projectId, kind, id, confirm: true });
                expect(confirmed.deleted).toBe(true);
                expect((await game.list(projectId, kind)).map((o) => o.id)).not.toContain(id);
            }
        });
    });

    describe("Requirement: Conditions and effects", () => {
        it.fails("Building a rule", async () => {
            const { game, projectId } = await seededGame();
            const sign = hotspot("sign", [{ verb: "look", when: [{ has: "map" }], effects: [{ say: "The shop is that way." }] }]);

            await game.save(projectId, "room", streetWith(sign));

            const street = await game.get(projectId, "room", "street");
            expect(street.hotspots.find((h) => h.id === "sign")?.interactions).toEqual([
                { verb: "look", when: [{ has: "map" }], effects: [{ say: "The shop is that way." }] },
            ]);
        });

        it.fails("An unknown effect", async () => {
            const { game, projectId } = await seededGame();
            const teleport = { teleport: "shop" } as unknown as Effect;

            const reason = await game.saveRefusal(projectId, "room", streetWith(hotspot("sign", [{ verb: "look", effects: [teleport] }])));

            expect(reason).toContain("teleport");
            for (const name of EFFECT_NAMES) expect(reason).toContain(name);
        });
    });

    describe("Requirement: Interactions", () => {
        it.fails("Using an item on a hotspot", async () => {
            const { game, projectId } = await seededGame();
            await game.save(projectId, "item", { id: "key", name: "Key", noUse: "It doesn't fit." });
            await game.save(projectId, "game", {
                id: "game", name: "Tune Street", start: { room: "street", items: ["key"] },
                protagonist: { name: PROTAGONIST, model: "character/bartender" },
            });
            const lock = hotspot("lock", [{ verb: "use", item: "key", effects: [{ take: "key" }, { set: "door-open", to: true }] }]);
            await game.save(projectId, "room", streetWith(lock));

            const { files } = await game.exportGame(projectId);

            const exported = roomFile(files, "street").hotspots.find((h) => h.id === "lock");
            expect(exported?.interactions).toEqual([
                { verb: "use", item: "key", effects: [{ take: "key" }, { set: "door-open", to: true }] },
            ]);
        });

        // The engine runs the first interaction whose conditions hold, so Annie's part is to keep their order.
        it.fails("A condition gates an interaction", async () => {
            const { game, projectId } = await seededGame();
            const poster = hotspot("poster", [
                { verb: "look", when: [{ flag: "door-open" }], effects: [{ say: "The shop is open." }] },
                { verb: "look", effects: [{ say: "The shop is closed." }] },
            ]);
            await game.save(projectId, "room", streetWith(poster));

            const { files } = await game.exportGame(projectId);

            expect(roomFile(files, "street").hotspots.find((h) => h.id === "poster")?.interactions).toEqual(poster.interactions);
        });
    });

    describe("Requirement: Puzzles", () => {
        it.fails("Defining a puzzle", async () => {
            const { game, projectId } = await seededGame();
            await game.save(projectId, "item", { id: "broken-guitar", name: "Broken guitar", noUse: "It's broken." });
            await game.save(projectId, "flag", { id: "guitar_fixed" });
            const puzzle = {
                id: "working-guitar",
                name: "get a working guitar",
                requires: [{ has: "broken-guitar" }],
                solvedWhen: { flag: "guitar_fixed" },
                grants: [{ reachGoal: "enter-shop" }],
            };

            await game.save(projectId, "puzzle", puzzle);

            expect(await game.get(projectId, "puzzle", "working-guitar")).toMatchObject(puzzle);
        });

        it.fails("Seeing what depends on what", async () => {
            const { game, projectId } = await seededGame();
            await game.save(projectId, "flag", { id: "has-gig" });
            await game.save(projectId, "puzzle", {
                id: "A", name: "Get a gig", requires: [], solvedWhen: { flag: "door-open" }, grants: [{ set: "has-gig", to: true }],
            });
            await game.save(projectId, "puzzle", {
                id: "B", name: "Play the gig", requires: [{ flag: "has-gig" }], solvedWhen: { has: "map" }, grants: [],
            });

            expect(await game.get(projectId, "puzzle", "A")).toMatchObject({ unlocks: ["B"], dependsOn: [] });
            expect(await game.get(projectId, "puzzle", "B")).toMatchObject({ dependsOn: ["A"], unlocks: [] });
        });
    });

    describe("Requirement: Acts, goals and endings", () => {
        it.fails("Branching to an ending", async () => {
            const { game, projectId } = await seededGame();
            await game.save(projectId, "act", { id: "ending-star", name: "A star", goals: [] });
            await game.save(projectId, "act", { id: "ending-band", name: "A band", goals: [] });

            await game.save(projectId, "act", {
                id: "3",
                name: "Act 3",
                goals: [{ id: "big-show", name: "The big show" }],
                next: [{ act: "ending-star", when: [{ stat: "followers", atLeast: 10 }] }, { act: "ending-band" }],
            });

            const acts = await game.list(projectId, "act");
            expect(acts).toContainEqual(expect.objectContaining({ id: "3", final: false }));
            expect(acts).toContainEqual(expect.objectContaining({ id: "ending-star", final: true }));
            expect(acts).toContainEqual(expect.objectContaining({ id: "ending-band", final: true }));
        });

        it.fails("An act that can get stuck", async () => {
            const { game, projectId } = await seededGame();
            await game.save(projectId, "act", { id: "ending-star", name: "A star", goals: [] });

            const reason = await game.saveRefusal(projectId, "act", {
                id: "finale",
                name: "Finale",
                goals: [{ id: "big-show", name: "The big show" }],
                next: [{ act: "ending-star", when: [{ stat: "followers", atLeast: 10 }] }],
            });

            expect(reason).toContain("finale");
        });
    });

    describe("Requirement: Worlds", () => {
        it.fails("A locked world", async () => {
            const { game, projectId } = await seededGame();
            const online: World = {
                id: "online", name: "Online", start: "feed",
                locked: "The band needs a name first.", unlockWhen: [{ flag: "door-open" }],
            };
            await game.save(projectId, "world", online);
            await game.save(projectId, "model", model("scene/feed"));
            await game.save(projectId, "room", room("feed", [], { world: "online" }));

            const { files } = await game.exportGame(projectId);

            const { worlds } = json<{ worlds: World[] }>(files, `${CONTENT}/worlds.json`);
            expect(worlds.find((w) => w.id === "online")).toEqual(online);
        });
    });

    describe("Requirement: Agent access", () => {
        it.fails("An agent adds a flag", async () => {
            const { game, projectId } = await seededGame();

            await game.save(projectId, "flag", { id: "lamp-on", description: "The lamp in the shop is lit." });

            expect(await app.objects(projectId, "flag")).toContainEqual(
                expect.objectContaining({ id: "lamp-on", description: "The lamp in the shop is lit." }),
            );
            const invalid = { id: "" };
            expect(await game.saveRefusal(projectId, "flag", invalid)).toBe(await appRefusal(projectId, "flag", invalid));
        });
    });
});
