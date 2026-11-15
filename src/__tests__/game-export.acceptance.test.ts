// Acceptance tests for openspec/specs/game-export (#1501), one per scenario. Each is `it.fails`
// until #1507 makes it pass; then it becomes `it`. Content files have the engine's layout
// (alexsiri7/punland frontend/src/content/*.json): items by id, with the start items.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api-auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-auth")>();
    return { ...actual, getCurrentUserId: vi.fn(() => null as string | null) };
});
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/storage/object-storage", async (importOriginal) =>
    (await import("./game-acceptance")).fakeStorage(await importOriginal()));

import { CONTENT, app, improvNode, json, seededGame, unreachableEnding } from "./game-acceptance";

describe("game-export", () => {
    describe("Requirement: The bundle", () => {
        it.fails("Exporting a game", async () => {
            const { game, projectId } = await seededGame();

            const { files } = await game.exportGame(projectId);

            expect(json(files, "manifest.json")).toMatchObject({
                game: "Tune Street",
                schemaVersion: expect.any(Number),
                start: { room: "street", items: [] },
            });
            expect(json(files, `${CONTENT}/worlds.json`)).toEqual({ worlds: [{ id: "street", name: "Street", start: "street" }] });
            expect(json(files, `${CONTENT}/items.json`)).toEqual({
                start: [], items: { map: { name: "Map", noUse: "That doesn't need a map." } },
            });
            expect(json(files, `${CONTENT}/characters.json`)).toEqual({
                protagonist: { model: "character/bartender" },
                characters: [{ id: "bartender", name: "Bartender", model: "character/bartender" }],
            });
            expect(json(files, `${CONTENT}/objects.json`)).toEqual({ objects: [{ id: "flyer", name: "Flyer", model: "object/flyer" }] });
            expect(json(files, `${CONTENT}/stats.json`)).toEqual({ stats: [{ id: "followers", name: "Followers", start: 0 }] });
            expect(json(files, `${CONTENT}/acts.json`)).toEqual({
                acts: [{ id: "1", name: "Act 1", goals: [{ id: "enter-shop", name: "Get into the shop" }] }],
            });
            expect(files.map((f) => f.path)).toEqual(expect.arrayContaining([
                `${CONTENT}/rooms/street.json`,
                `${CONTENT}/rooms/shop.json`,
                "frontend/src/assets/models.json",
                "backend/src/punland_api/content/characters/bartender.json",
            ]));
            // The registry in the engine's shape: the file and height sit under model3d.
            expect(json(files, "frontend/src/assets/models.json")).toEqual({
                models: expect.arrayContaining([
                    { id: "scene/street", kind: "scene", model3d: { file: "models/scenes/street.glb", placeholder: false } },
                    { id: "character/bartender", kind: "character", model3d: { file: "models/characters/bartender.glb", placeholder: false, height: 1.55 } },
                ]),
            });
            // The improv node's character sheet, in the engine's shape; what the character knows goes in the sheet's text.
            const improv = improvNode();
            const sheet = json(files, "backend/src/punland_api/content/characters/bartender.json") as Record<string, unknown>;
            expect(Object.keys(sheet).sort()).toEqual(["canned", "goal", "name", "sheet"]);
            expect(sheet).toMatchObject({ name: "Bartender", goal: improv.goal, canned: improv.canned });
            expect(sheet.sheet).toEqual(expect.stringContaining(improv.persona));
            expect(sheet.sheet).toEqual(expect.stringContaining(improv.knows));
            // The model files stay in the engine's repository: the registry names them, the bundle holds none.
            expect(files.filter((f) => f.path.startsWith("frontend/public/") || f.encoding === "base64")).toEqual([]);
        });
    });

    describe("Requirement: Deterministic output", () => {
        it.fails("Exporting twice", async () => {
            const { game, projectId } = await seededGame();

            const first = await game.exportGame(projectId);
            const second = await game.exportGame(projectId);

            expect(second).toEqual(first);
            const paths = first.files.map((f) => f.path);
            expect(paths).toEqual([...paths].sort());
        });
    });

    describe("Requirement: Lint gate", () => {
        it.fails("Exporting a broken game", async () => {
            const { game, projectId } = await seededGame();
            await unreachableEnding(game, projectId);

            const reason = await game.refusal("export_game", { projectId });

            expect(reason).toContain("ending-a");
        });
    });

    describe("Requirement: Engine compatibility", () => {
        it.fails("Several outcomes in an improv node", async () => {
            const { game, projectId } = await seededGame();
            await game.save(projectId, "conversation", {
                id: "bartender-talk", character: "bartender", entry: "pitch",
                nodes: [improvNode({
                    id: "pitch",
                    outcomes: [
                        { id: "promised", when: "she promises to put in a word", effects: [], next: null },
                        { id: "refused", when: "she will not help", effects: [], next: null },
                    ],
                })],
            });

            const reason = await game.refusal("export_game", { projectId });

            expect(reason).toContain("pitch");
            expect(reason).toContain("outcome");
        });
    });

    describe("Requirement: Getting the bundle", () => {
        it.fails("An agent exports a game", async () => {
            const { game, projectId } = await seededGame();

            const bundle = await game.exportGame(projectId);

            const download = await app.exportGame(projectId);
            expect(download.status).toBe(200);
            expect(download.body).toEqual(bundle);
        });
    });
});
