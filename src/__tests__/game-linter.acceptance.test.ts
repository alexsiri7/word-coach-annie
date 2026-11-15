// Acceptance tests for openspec/specs/game-linter (#1501), one per scenario. Each is `it.fails`
// until #1506 makes it pass; then it becomes `it`.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api-auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-auth")>();
    return { ...actual, getCurrentUserId: vi.fn(() => null as string | null) };
});
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/storage/object-storage", async (importOriginal) =>
    (await import("./game-acceptance")).fakeStorage(await importOriginal()));

import {
    DOOR, FLYER, PROTAGONIST, app, model, room, seededGame, unreachableEnding,
    type Condition, type Finding, type GameClient, type Hotspot,
} from "./game-acceptance";

function hotspot(id: string, interactions: Hotspot["interactions"]): Hotspot {
    return { id, name: id, verb: "Use", target: { node: id }, walkTo: { x: 640, y: 600 }, interactions };
}

const confirmDelete = (game: GameClient, projectId: string, kind: string, id: string) =>
    game.call("delete_game_object", { projectId, kind, id, confirm: true });

const mentions = (finding: Finding, text: string) => JSON.stringify(finding).includes(text);

describe("game-linter", () => {
    describe("Requirement: Schema and references", () => {
        it.fails("A dangling exit", async () => {
            const { game, projectId } = await seededGame();
            await confirmDelete(game, projectId, "room", "shop");

            const { errors } = await game.lint(projectId);

            expect(errors).toContainEqual(expect.objectContaining({
                object: { kind: "room", id: "street" },
                field: expect.stringContaining("goTo"),
                message: expect.stringContaining("shop"),
            }));
        });

        it.fails("A missing item", async () => {
            const { game, projectId } = await seededGame();
            await confirmDelete(game, projectId, "item", "map");

            const { errors } = await game.lint(projectId);

            expect(errors).toContainEqual(expect.objectContaining({
                object: { kind: "room", id: "shop" },
                field: expect.stringMatching(/interactions.*has/),
                message: expect.stringContaining("map"),
            }));
        });
    });

    describe("Requirement: Reachability", () => {
        it.fails("An unreachable room", async () => {
            const { game, projectId } = await seededGame();
            await game.save(projectId, "model", model("scene/cellar"));
            await game.save(projectId, "room", room("cellar", []));

            const { errors } = await game.lint(projectId);

            expect(errors).toContainEqual(expect.objectContaining({ object: { kind: "room", id: "cellar" } }));
        });

        it.fails("An ending that cannot be reached", async () => {
            const { game, projectId } = await seededGame();
            await unreachableEnding(game, projectId);

            const { errors } = await game.lint(projectId);

            expect(errors).toContainEqual(expect.objectContaining({
                object: { kind: "act", id: "ending-a" },
                message: expect.stringContaining("followers"),
            }));
        });
    });

    describe("Requirement: Softlocks", () => {
        it.fails("An item used up too early", async () => {
            const { game, projectId } = await seededGame();
            await game.save(projectId, "item", { id: "ticket", name: "Ticket", noUse: "Not here." });
            await game.save(projectId, "game", {
                id: "game", name: "Tune Street", start: { room: "street", items: ["ticket"] },
                protagonist: { name: PROTAGONIST, model: "character/bartender" },
            });
            await game.save(projectId, "act", {
                id: "1", name: "Act 1", goals: [{ id: "enter-shop", name: "Get into the shop" }, { id: "show-ticket", name: "Show the ticket" }],
            });
            const booth = hotspot("booth", [{ verb: "use", item: "ticket", effects: [{ reachGoal: "show-ticket" }] }]);
            const gate = (when?: Condition[]) => hotspot("gate", [{ verb: "use", item: "ticket", when, effects: [{ take: "ticket" }] }]);
            const namesBoth = (errors: Finding[]) => errors.some((e) => mentions(e, "gate") && mentions(e, "booth"));

            await game.save(projectId, "room", room("street", [FLYER, DOOR, gate(), booth]));
            expect(namesBoth((await game.lint(projectId)).errors)).toBe(true);

            await game.save(projectId, "room", room("street", [FLYER, DOOR, gate([{ goal: "show-ticket" }]), booth]));
            expect(namesBoth((await game.lint(projectId)).errors)).toBe(false);
        });
    });

    describe("Requirement: Unused and incomplete", () => {
        it.fails("A flag nothing reads", async () => {
            const { game, projectId } = await seededGame();
            await game.save(projectId, "flag", { id: "lamp-on" });
            const lamp = hotspot("lamp", [{ verb: "use", effects: [{ set: "lamp-on", to: true }] }]);
            await game.save(projectId, "room", room("street", [FLYER, DOOR, lamp]));

            const { warnings } = await game.lint(projectId);

            expect(warnings.some((w) => mentions(w, "lamp-on"))).toBe(true);
            expect(warnings.some((w) => mentions(w, "door-open"))).toBe(false);
        });
    });

    describe("Requirement: Errors and warnings", () => {
        it.fails("Only warnings", async () => {
            const { game, projectId } = await seededGame();
            await game.save(projectId, "model", model("scene/shop", { status: "in progress" }));

            const lint = await game.lint(projectId);
            expect(lint.errors).toEqual([]);
            expect(lint.warnings).not.toEqual([]);

            const bundle = await game.exportGame(projectId);
            expect(bundle.files).not.toEqual([]);
            expect(bundle.warnings).toEqual(lint.warnings);
        });
    });

    describe("Requirement: Where it runs", () => {
        it.fails("An agent lints a game", async () => {
            const { game, projectId } = await seededGame();
            await game.save(projectId, "model", model("scene/cellar", { status: "placeholder", fileData: undefined }));
            await game.save(projectId, "room", room("cellar", []));

            const lint = await game.lint(projectId);

            expect(lint.errors).not.toEqual([]);
            expect(lint.warnings).not.toEqual([]);
            expect(await app.lint(projectId)).toEqual(lint);
        });
    });
});
