// Acceptance tests for openspec/specs/game-import (#1501), one per scenario. Each is `it.fails`
// until #1508 makes it pass; then it becomes `it`. "Migrating Tune Story" runs only with
// PUNLAND_DIR set to a checkout of alexsiri7/punland.
import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

vi.mock("@/lib/api-auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-auth")>();
    return { ...actual, getCurrentUserId: vi.fn(() => null as string | null) };
});
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/storage/object-storage", async (importOriginal) =>
    (await import("./game-acceptance")).fakeStorage(await importOriginal()));

import {
    CONTENT, connectGame, newGameProject, seededGame,
    type BundleFile, type GameClient, type ImportResult, type ImprovNode, type Kind,
} from "./game-acceptance";

const SHEETS = "backend/src/punland_api/content/characters";

const importGame = (game: GameClient, projectId: string, files: BundleFile[], confirm?: boolean) =>
    game.call<ImportResult>("import_game", { projectId, files, confirm });

function withJson(files: BundleFile[], path: string, change: (content: Record<string, unknown>) => void): BundleFile[] {
    return files.map((file) => {
        if (file.path !== path) return file;
        const content = JSON.parse(file.content);
        change(content);
        return { ...file, content: JSON.stringify(content, null, 2) };
    });
}

/** What a project lists of a kind, less the story objects a project's rooms live in. */
async function contentOf(game: GameClient, projectId: string, kind: Kind) {
    return (await game.list(projectId, kind)).map((object) => {
        const { storyObjectId: _, ...rest } = object as typeof object & { storyObjectId?: string };
        return rest;
    });
}

/** A seeded project, its bundle, and an empty game project to import into. */
async function exportedGame() {
    const { game, projectId } = await seededGame();
    const { files } = await game.exportGame(projectId);
    const empty = await newGameProject(game, "Imported");
    return { game, projectId, files, empty };
}

/** The engine's content, as a bundle: content and asset JSON as text, model files as base64. */
function engineFiles(root: string): BundleFile[] {
    const text = (path: string): BundleFile => ({ path, encoding: "utf8", content: readFileSync(join(root, path), "utf8") });
    const jsonIn = (dir: string) => readdirSync(join(root, dir)).filter((f) => f.endsWith(".json")).map((f) => text(`${dir}/${f}`));
    const registry = text("frontend/src/assets/models.json");
    const models = (JSON.parse(registry.content) as { models: { model3d: { file: string } }[] }).models
        .map((m) => `frontend/public/${m.model3d.file}`)
        .filter((path) => existsSync(join(root, path)))
        .map((path): BundleFile => ({ path, encoding: "base64", content: readFileSync(join(root, path)).toString("base64") }));
    return [...jsonIn(CONTENT), ...jsonIn(`${CONTENT}/rooms`), ...jsonIn(SHEETS), registry, ...models];
}

describe("game-import", () => {
    describe("Requirement: Importing a bundle", () => {
        it.fails("Importing content", async () => {
            const { game, projectId, files, empty } = await exportedGame();

            await importGame(game, empty, files);

            for (const kind of ["room", "item", "character", "object", "stat", "act", "world"] as const) {
                expect(await contentOf(game, empty, kind)).toEqual(await contentOf(game, projectId, kind));
            }
        });

        it.fails("A character sheet", async () => {
            const { game, files, empty } = await exportedGame();
            const sheet = {
                name: "Bartender",
                sheet: "You are the bartender of The Three Crows, dry, unhurried and quietly kind. "
                    + "You know the third crow won't vouch for anyone who doesn't live in Punland.",
                canned: "The bartender raises a wing: busy night, kid.",
                goal: "promise to put in a word with the third crow",
            };
            const path = `${SHEETS}/bartender.json`;
            const bundle = [...files.filter((f) => f.path !== path), { path, encoding: "utf8" as const, content: JSON.stringify(sheet) }];

            await importGame(game, empty, bundle);

            const improv = (await game.list(empty, "conversation"))
                .filter((c) => c.character === "bartender")
                .flatMap((c) => c.nodes)
                .find((n): n is ImprovNode => n.type === "improv");
            // The engine's sheet has no field of its own for what the character knows: it is in the sheet's text.
            expect(improv?.persona).toContain(sheet.sheet);
            expect(improv?.goal).toBe(sheet.goal);
            expect(improv?.canned).toBe(sheet.canned);
        });
    });

    describe("Requirement: Round trip", () => {
        it.fails("Export, import, export", async () => {
            const { game, files, empty } = await exportedGame();

            await importGame(game, empty, files);

            expect((await game.exportGame(empty)).files).toEqual(files);
        });
    });

    describe("Requirement: Report what could not be read", () => {
        it.fails("An unknown field", async () => {
            const { game, files, empty } = await exportedGame();
            const path = `${CONTENT}/rooms/street.json`;

            const report = await importGame(game, empty, withJson(files, path, (room) => { room.sparkle = true; }));

            expect(report.unmapped).toContainEqual({ file: path, field: expect.stringContaining("sparkle") });
            const street = await game.get(empty, "room", "street");
            expect(street).not.toHaveProperty("sparkle");
            expect(street.hotspots.map((h) => h.id)).toEqual(["flyer", "door"]);
        });
    });

    describe("Requirement: No silent overwrite", () => {
        it.fails("Importing over existing objects", async () => {
            const { game, projectId, files } = await exportedGame();
            const relabelled = withJson(files, `${CONTENT}/rooms/street.json`, (room) => { room.label = "PUNLAND · THE OLD STREET"; });
            const label = async () => (await game.get(projectId, "room", "street")).label;
            const before = await label();

            const preview = await importGame(game, projectId, relabelled);

            expect(preview.applied).toBe(false);
            expect(preview.changes).toContainEqual({
                kind: "room", id: "street", change: "update",
                differences: [{ field: "label", from: before, to: "PUNLAND · THE OLD STREET" }],
            });
            expect(await label()).toBe(before);

            const confirmed = await importGame(game, projectId, relabelled, true);
            expect(confirmed.applied).toBe(true);
            expect(await label()).toBe("PUNLAND · THE OLD STREET");
        });
    });

    describe("Requirement: Migrating an existing game", () => {
        // The other half of the scenario, that the engine plays the same main-path route on the
        // exported bundle, needs the engine: it is an operator check (#1501).
        (process.env.PUNLAND_DIR ? it.fails : it.skip)("Migrating Tune Story", async () => {
            const original = engineFiles(process.env.PUNLAND_DIR!);
            const game = await connectGame();
            const projectId = await newGameProject(game, "Tune Story");

            await importGame(game, projectId, original);
            const { files } = await game.exportGame(projectId);

            for (const file of original.filter((f) => f.encoding === "utf8")) {
                expect(JSON.parse(files.find((f) => f.path === file.path)?.content ?? "null"), file.path).toEqual(JSON.parse(file.content));
            }
        });
    });
});
