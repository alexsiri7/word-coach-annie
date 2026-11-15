// Acceptance tests for openspec/specs/game-export (#1501), one per scenario. Each is `it.fails`
// until #1507 makes it pass; then it becomes `it`.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api-auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-auth")>();
    return { ...actual, getCurrentUserId: vi.fn(() => null as string | null) };
});
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/storage/supabase-storage", async (importOriginal) =>
    (await import("./game-acceptance")).fakeStorage(await importOriginal()));

import { CONTENT, app, bundleFile, improvNode, json, model, seededGame, unreachableEnding } from "./game-acceptance";

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
            const paths = files.map((f) => f.path);
            for (const name of ["worlds", "items", "characters", "objects", "stats", "acts"]) {
                expect(paths).toContain(`${CONTENT}/${name}.json`);
            }
            expect(paths).toEqual(expect.arrayContaining([
                `${CONTENT}/rooms/street.json`,
                `${CONTENT}/rooms/shop.json`,
                "frontend/src/assets/models.json",
                "backend/src/punland_api/content/characters/bartender.json",
            ]));
            const street = model("scene/street");
            expect(bundleFile(files, `frontend/public/${street.file}`)).toEqual({
                path: `frontend/public/${street.file}`, encoding: "base64", content: street.fileData,
            });
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
