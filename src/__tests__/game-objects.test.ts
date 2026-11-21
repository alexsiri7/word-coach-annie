// What a save of a game object refuses, what a delete does, and how a project export
// carries the objects, beyond the game-world-model acceptance scenarios (#1502).
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api-auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-auth")>();
    return { ...actual, getCurrentUserId: vi.fn(() => null as string | null) };
});
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/storage/object-storage", async (importOriginal) =>
    (await import("./game-acceptance")).fakeStorage(await importOriginal()));

import { NextRequest } from "next/server";
import { CONDITION_NAMES, GAME_OBJECT_KINDS } from "@/schemas/game-objects";
import { exportProjectJson } from "@/lib/export-json";
import { importProjectJson } from "@/lib/import-json";
import { DELETE, PUT } from "@/app/api/projects/[id]/game/objects/[kind]/[objectId]/route";
import { ProjectsController } from "@/lib/controllers/projects";
import { DOOR, FLYER, improvNode, room, seededGame, type Condition, type Hotspot } from "./game-acceptance";

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

    it("refuses a goal listed twice in one act", async () => {
        const { game, projectId } = await seededGame();
        const twice = [{ id: "encore", name: "Encore" }, { id: "encore", name: "Again" }];

        expect(await game.saveRefusal(projectId, "act", { id: "2", name: "Act 2", goals: twice }))
            .toBe('goals[1].id: goal "encore" is listed twice');
    });

    it("refuses to drop a goal from an act while a rule names it", async () => {
        const { game, projectId } = await seededGame();

        const reason = await game.saveRefusal(projectId, "act", { id: "1", name: "Act 1", goals: [] });

        expect(reason).toBe('goals: goal "enter-shop" is still named by room "shop" at hotspots[counter].interactions[0].effects[1].reachGoal');
        expect((await game.get(projectId, "act", "1")).goals).toEqual([{ id: "enter-shop", name: "Get into the shop" }]);
    });

    it("refuses unlock conditions on a world that is not locked", async () => {
        const { game, projectId } = await seededGame();

        expect(await game.saveRefusal(projectId, "world", { id: "city", name: "City", start: "street", unlockWhen: [{ has: "map" }] }))
            .toBe("unlockWhen: only a locked world has unlock conditions");
    });

    it("refuses a rule in a character or a conversation that names a flag the game does not have", async () => {
        const { game, projectId } = await seededGame();
        const setNope = [{ set: "nope", to: true }];

        expect(await game.saveRefusal(projectId, "character", {
            id: "bartender", name: "Bartender", model: "character/bartender", onGoal: [{ effects: setNope }],
        })).toBe('onGoal[0].effects[0].set: there is no flag "nope" in this game');
        expect(await game.saveRefusal(projectId, "conversation", {
            id: "bartender-talk", character: "bartender", entry: "improv",
            nodes: [improvNode({ fallback: { effects: setNope, next: null } })],
        })).toBe('nodes[0].fallback.effects[0].set: there is no flag "nope" in this game');
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

describe("PUT /api/projects/[id]/game/objects/[kind]/[objectId]", () => {
    it("refuses a body whose id is not the one in the address", async () => {
        const { projectId } = await seededGame();
        const params = { id: projectId, kind: "flag", objectId: "lamp-on" };
        const req = new NextRequest(`http://localhost/api/projects/${projectId}/game/objects/flag/lamp-on`, {
            method: "PUT",
            headers: { "content-type": "application/json", "x-csrf-protection": "1" },
            body: JSON.stringify({ id: "door-open" }),
        });

        const res = await PUT(req, { params: Promise.resolve(params) });

        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('The object\'s id "door-open" does not match the address "lamp-on"');
    });
});

describe("DELETE /api/projects/[id]/game/objects/[kind]/[objectId]", () => {
    function remove(projectId: string, query = "") {
        const params = { id: projectId, kind: "item", objectId: "map" };
        const req = new NextRequest(`http://localhost/api/projects/${projectId}/game/objects/item/map${query}`, {
            method: "DELETE",
            headers: { "x-csrf-protection": "1" },
        });
        return DELETE(req, { params: Promise.resolve(params) });
    }

    it("lists the uses of an object in use, and deletes it only with confirm=true", async () => {
        const { game, projectId } = await seededGame();

        const unconfirmed = await remove(projectId);
        expect(unconfirmed.status).toBe(200);
        expect(await unconfirmed.json()).toMatchObject({ deleted: false, usedBy: expect.arrayContaining([expect.objectContaining({ kind: "room" })]) });
        expect((await game.list(projectId, "item")).map((o) => o.id)).toContain("map");

        const confirmed = await remove(projectId, "?confirm=true");
        expect(confirmed.status).toBe(200);
        expect(await confirmed.json()).toMatchObject({ deleted: true });
        expect(await game.list(projectId, "item")).toEqual([]);
    });
});

describe("changing a project's type", () => {
    it("keeps a game a game while it has game objects", async () => {
        const { game, projectId } = await seededGame();

        await expect(ProjectsController.updateProject(projectId, { projectType: "FICTION" }))
            .rejects.toThrow("A game project keeps its type while it has game objects");
        expect(await game.list(projectId, "flag")).toEqual([{ id: "door-open" }]);
    });
});

describe("project JSON export and import", () => {
    it("carries a game's objects to the imported project", async () => {
        const { game, projectId } = await seededGame();
        const { projectId: imported } = await importProjectJson(await exportProjectJson(projectId), { userId: "game-author" });

        for (const kind of GAME_OBJECT_KINDS) expect(await game.list(imported, kind)).toEqual(await game.list(projectId, kind));
    });

    it("restores a game whose rules still name an object a confirmed delete removed", async () => {
        const { game, projectId } = await seededGame();
        await game.call("delete_game_object", { projectId, kind: "flag", id: "door-open", confirm: true });

        const { projectId: imported } = await importProjectJson(await exportProjectJson(projectId), { userId: "game-author" });

        expect(await game.list(imported, "flag")).toEqual([]);
        expect(await game.list(imported, "room")).toEqual(await game.list(projectId, "room"));
    });

    it("refuses to import an object twice, or a goal in two acts", async () => {
        const { projectId } = await seededGame();
        const data = await exportProjectJson(projectId);
        const importing = (gameObjects: typeof data.gameObjects) => importProjectJson({ ...data, gameObjects }, { userId: "game-author" });
        const flag = data.gameObjects.find((g) => g.kind === "flag")!;
        const act = { ...flag, kind: "act", object: { id: "2", name: "Act 2", goals: [{ id: "enter-shop", name: "Again" }] } };

        await expect(importing([...data.gameObjects, flag])).rejects.toThrow('Invalid game objects: there are two of flag "door-open"');
        await expect(importing([...data.gameObjects, act])).rejects.toThrow(
            'Invalid game objects: act "2": goals[0].id: goal "enter-shop" already belongs to act "1"',
        );
    });
});
