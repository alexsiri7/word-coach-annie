// What a save of a game object refuses and a delete does, beyond the game-world-model
// acceptance scenarios (#1502).
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api-auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-auth")>();
    return { ...actual, getCurrentUserId: vi.fn(() => null as string | null) };
});
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/storage/object-storage", async (importOriginal) =>
    (await import("./game-acceptance")).fakeStorage(await importOriginal()));

import { CONDITION_NAMES } from "@/schemas/game-objects";
import { DOOR, FLYER, room, seededGame, type Condition, type Hotspot } from "./game-acceptance";

function sign(interaction: Hotspot["interactions"][number]): Hotspot {
    return { id: "sign", name: "Sign", verb: "Look at", target: { node: "sign" }, walkTo: { x: 640, y: 600 }, interactions: [interaction] };
}

const streetWith = (interaction: Hotspot["interactions"][number]) => room("street", [FLYER, DOOR, sign(interaction)]);

describe("save_game_object", () => {
    it("refuses a condition that names a flag the game does not have", async () => {
        const { game, projectId } = await seededGame();

        const reason = await game.saveRefusal(projectId, "room", streetWith({ verb: "look", when: [{ flag: "nope" }], effects: [] }));

        expect(reason).toBe('hotspots[sign].interactions[0].when[0].flag: there is no flag "nope" in this game');
    });

    it("refuses an unknown condition, listing every condition", async () => {
        const { game, projectId } = await seededGame();
        const raining = { raining: true } as unknown as Condition;

        const reason = await game.saveRefusal(projectId, "room", streetWith({ verb: "look", when: [raining], effects: [] }));

        expect(reason).toBe(`hotspots[sign].interactions[0].when[0]: unknown condition "raining"; the conditions are ${CONDITION_NAMES.join(", ")}`);
    });

    it("refuses a use interaction without an item, and an item on any other verb", async () => {
        const { game, projectId } = await seededGame();

        expect(await game.saveRefusal(projectId, "room", streetWith({ verb: "use", effects: [] })))
            .toBe("hotspots[sign].interactions[0].item: a use interaction needs the item it uses");
        expect(await game.saveRefusal(projectId, "room", streetWith({ verb: "look", item: "map", effects: [] })))
            .toBe("hotspots[sign].interactions[0].item: only a use interaction has an item");
    });

    it("refuses a goal another act already has", async () => {
        const { game, projectId } = await seededGame();

        const reason = await game.saveRefusal(projectId, "act", { id: "2", name: "Act 2", goals: [{ id: "enter-shop", name: "Again" }] });

        expect(reason).toBe('goals[0].id: goal "enter-shop" already belongs to act "1"');
    });

    it("refuses game objects in a project that is not a game", async () => {
        const { game } = await seededGame();
        const fiction = await game.call<{ id: string }>("create_project", { title: "A novel" });

        expect(await game.saveRefusal(fiction.id, "flag", { id: "lamp-on" }))
            .toBe("Game objects belong to game projects; this is a FICTION project");
    });

    it("saves an act and a puzzle as a read returns them, ignoring what Annie derives", async () => {
        const { game, projectId } = await seededGame();
        await game.save(projectId, "puzzle", { id: "p", name: "Get in", requires: [], solvedWhen: { has: "map" }, grants: [] });

        const act = await game.get(projectId, "act", "1");
        const puzzle = await game.get(projectId, "puzzle", "p");

        expect(await game.save(projectId, "act", act)).toEqual(act);
        expect(await game.save(projectId, "puzzle", puzzle)).toEqual(puzzle);
    });
});

describe("delete_game_object", () => {
    it("deletes an object nothing uses without asking", async () => {
        const { game, projectId } = await seededGame();

        expect(await game.call("delete_game_object", { projectId, kind: "stat", id: "followers" })).toEqual({ deleted: true, usedBy: [] });
        expect(await game.list(projectId, "stat")).toEqual([]);
    });

    it("lists a rule that names one of an act's goals as a use of the act", async () => {
        const { game, projectId } = await seededGame();

        const result = await game.call("delete_game_object", { projectId, kind: "act", id: "1" });

        expect(result).toEqual({
            deleted: false,
            usedBy: [{ kind: "room", id: "shop", field: "hotspots[counter].interactions[0].effects[1].reachGoal" }],
        });
    });

    it("refuses to delete an object the game does not have", async () => {
        const { game, projectId } = await seededGame();

        expect(await game.refusal("delete_game_object", { projectId, kind: "flag", id: "nope" })).toBe('There is no flag "nope" in this game');
    });
});
