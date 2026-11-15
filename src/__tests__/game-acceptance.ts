/**
 * Harness for the game-authoring acceptance tests (#1501): the contract that the
 * game-world-model, game-scenes-and-hotspots, game-dialogue, game-linter and game-export
 * specs are built against (#1502–#1507). Tests reach the game only through
 * Annie's MCP tools and the app's routes, so the storage behind them stays the
 * implementation's choice.
 *
 * Game objects keep the engine's shapes (alexsiri7/punland frontend/src/domain/content.ts),
 * plus an `id`. Kinds the engine has no file for (flag, puzzle, model, conversation, game)
 * follow the same style.
 */
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { getCurrentUserId } from "@/lib/api-auth";
import { UNEXPECTED_ERROR_REASON } from "@/mcp/tool-errors";
import { testPrisma } from "./setup";

// ─── The engine's vocabulary ─────────────────────────────────────────────────

import type {
    Act, Character, Conversation, Effect, Flag, GameSettings, Item, Model, Prop, Puzzle, Room, Stat, World,
} from "@/schemas/game-objects";

export type {
    Act, Character, Condition, Conversation, DialogueNode, Effect, FlagValue, FloorPoint, Flag, GameSettings, Hotspot,
    HotspotTarget, ImprovNode, Interaction, Item, Model, Prop, Puzzle, Reaction, Room, Stat, World,
} from "@/schemas/game-objects";

/**
 * The engine's effects, written out here rather than imported, so a test can check that
 * Annie's own list names every one of them.
 */
export const EFFECT_NAMES = [
    "say", "goTo", "goBack", "wait", "pickUp", "give", "take", "gather", "set", "talk", "changeStat", "reachGoal",
] as const;

// ─── Game objects, by kind ───────────────────────────────────────────────────

/** What `save_game_object` takes, by kind. */
export interface GameObjectInput {
    game: GameSettings;
    item: Item;
    flag: Flag;
    stat: Stat;
    act: Act;
    world: World;
    puzzle: Puzzle;
    character: Character;
    object: Prop;
    model: Model;
    room: Room;
    conversation: Conversation;
}

export type Kind = keyof GameObjectInput;

/** What the tools return, by kind: the input plus fields Annie derives. */
export interface GameObjectOutput extends Omit<GameObjectInput, "act" | "puzzle" | "model" | "room"> {
    /** `final`: the act has no next entries; endings are the final acts. */
    act: Act & { final: boolean };
    /** Puzzle ids, through the flags one's grants set and another's requires read. */
    puzzle: Puzzle & { dependsOn: string[]; unlocks: string[] };
    model: Model & { placeholder: boolean };
    /** The LOCATION story object that holds the room. */
    room: Room & { storyObjectId: string };
}

export interface ObjectRef { kind: Kind; id: string }

export interface Finding {
    severity: "error" | "warning";
    message: string;
    object: ObjectRef;
    /** A path in the object, e.g. `hotspots[door].interactions[0].effects[0].goTo`. */
    field: string;
    related?: { object: ObjectRef; field: string }[];
}

export interface LintResult { errors: Finding[]; warnings: Finding[] }

export interface BundleFile { path: string; encoding: "utf8" | "base64"; content: string }

/** Sorted by path. */
export interface Bundle { files: BundleFile[]; warnings: Finding[] }

export interface ImportResult {
    applied: boolean;
    changes: (
        | { kind: Kind; id: string; change: "add" }
        | { kind: Kind; id: string; change: "update"; differences: { field: string; from: unknown; to: unknown }[] }
    )[];
    unmapped: { file: string; field: string }[];
}

/** `{ outcome: "fallback" }` takes an improv node's fallback. */
export type PreviewStep = { choose: number } | { outcome: string };

export interface PreviewResult {
    /** Lines only; the protagonist's name stands in for {protagonist}. */
    transcript: { speaker: string; text: string }[];
    awaiting:
        | null
        | { nodeId: string; kind: "choice"; options: { index: number; text: string }[] }
        | { nodeId: string; kind: "improv"; outcomes: string[] };
    effects: Effect[];
    ended: boolean;
}

// ─── Mocks every test file installs ──────────────────────────────────────────

/** Object storage held in memory, for snapshot screenshots. */
const stored = new Map<string, Buffer>();

type StorageModule = typeof import("@/lib/storage/object-storage");

export function fakeStorage(actual: StorageModule): StorageModule {
    const signed = (path: string) => `https://storage.test/signed/${path}?token=t`;
    return {
        ...actual,
        uploadObject: vi.fn(async (path: string, data: Buffer) => { stored.set(path, data); }),
        createSignedUrl: vi.fn(async (path: string) => signed(path)),
        createSignedUrls: vi.fn(async (paths: string[]) => new Map(paths.map((p) => [p, signed(p)]))),
        removeObjects: vi.fn(async (paths: string[]) => { for (const p of paths) stored.delete(p); }),
    };
}

// ─── MCP ─────────────────────────────────────────────────────────────────────

export interface GameClient {
    /** Calls a tool and returns its JSON result; a refusal throws with the tool's text. */
    call<T = unknown>(name: string, args: Record<string, unknown>): Promise<T>;
    /** Calls a tool that must refuse, and returns the reason it gives. */
    refusal(name: string, args: Record<string, unknown>): Promise<string>;
    list<K extends Kind>(projectId: string, kind: K): Promise<GameObjectOutput[K][]>;
    get<K extends Kind>(projectId: string, kind: K, id: string): Promise<GameObjectOutput[K]>;
    save<K extends Kind>(projectId: string, kind: K, object: GameObjectInput[K]): Promise<GameObjectOutput[K]>;
    /** The reason `save_game_object` refuses the object with. */
    saveRefusal<K extends Kind>(projectId: string, kind: K, object: GameObjectInput[K]): Promise<string>;
    lint(projectId: string): Promise<LintResult>;
    exportGame(projectId: string): Promise<Bundle>;
}

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };

/** A missing tool or a crash is not a validation refusal, though `it.fails` would take it for one. */
const NOT_A_REFUSAL = new RegExp(`Tool .+ not found|${UNEXPECTED_ERROR_REASON}`);

export async function connectGame(): Promise<GameClient> {
    const userId = "game-author";
    await testPrisma.user.create({ data: { id: userId, email: `${userId}@test.com`, googleId: `g-${userId}` } });
    vi.mocked(getCurrentUserId).mockReturnValue(userId);

    const { createServer } = await import("@/mcp/index");
    const server = createServer({ userId, allowDestructive: true });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "game-acceptance", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const raw = async (name: string, args: Record<string, unknown>) =>
        (await client.callTool({ name, arguments: args })) as ToolResult;

    const call = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
        const result = await raw(name, args);
        const text = result.content[0]?.text ?? "";
        if (result.isError) throw new Error(text);
        return JSON.parse(text) as T;
    };

    const refusal = async (name: string, args: Record<string, unknown>): Promise<string> => {
        const result = await raw(name, args);
        const text = result.content[0]?.text ?? "";
        if (!result.isError) throw new Error(`${name} was expected to refuse, and returned ${text}`);
        if (NOT_A_REFUSAL.test(text)) throw new Error(`${name} did not refuse: ${text}`);
        return text.slice(text.indexOf(": ") + 2);
    };

    return {
        call,
        refusal,
        list: async (projectId, kind) =>
            (await call<{ objects: never[] }>("list_game_objects", { projectId, kind })).objects,
        get: (projectId, kind, id) => call("get_game_object", { projectId, kind, id }),
        save: (projectId, kind, object) => call("save_game_object", { projectId, kind, object }),
        saveRefusal: (projectId, kind, object) => refusal("save_game_object", { projectId, kind, object }),
        lint: (projectId) => call("lint_game", { projectId }),
        exportGame: (projectId) => call("export_game", { projectId }),
    };
}

export async function newGameProject(game: GameClient, title = "Tune Street"): Promise<string> {
    const project = await game.call<{ id: string; projectType: string }>("create_project", { title, projectType: "GAME" });
    if (project.projectType !== "GAME") throw new Error(`create_project made a ${project.projectType} project`);
    return project.id;
}

// ─── A small game with no lint errors ────────────────────────────────────────

import { COUNTER, DOOR, FLOOR, FLYER, PROTAGONIST, improvNode, model, room } from "./game-fixtures";

export { COUNTER, DOOR, FLOOR, FLYER, PROTAGONIST, improvNode, model, room };

/**
 * Saves the game in dependency order, so nothing names an object saved after it. The one
 * exception is the world's start, a room saved after the world: that is the linter's to
 * report, not the save's.
 */
export async function seedGame(game: GameClient, projectId: string): Promise<void> {
    for (const id of ["scene/street", "scene/shop", "object/flyer"]) await game.save(projectId, "model", model(id));
    await game.save(projectId, "model", model("character/bartender", { height: 1.55 }));
    await game.save(projectId, "world", { id: "street", name: "Street", start: "street" });
    await game.save(projectId, "character", { id: "bartender", name: "Bartender", model: "character/bartender" });
    await game.save(projectId, "object", { id: "flyer", name: "Flyer", model: "object/flyer" });
    await game.save(projectId, "item", { id: "map", name: "Map", noUse: "That doesn't need a map." });
    await game.save(projectId, "flag", { id: "door-open" });
    await game.save(projectId, "stat", { id: "followers", name: "Followers", start: 0 });
    await game.save(projectId, "act", { id: "1", name: "Act 1", goals: [{ id: "enter-shop", name: "Get into the shop" }] });
    await game.save(projectId, "room", room("shop", [COUNTER]));
    await game.save(projectId, "room", room("street", [FLYER, DOOR]));
    await game.save(projectId, "conversation", { id: "bartender-talk", character: "bartender", entry: "improv", nodes: [improvNode()] });
    await game.save(projectId, "game", {
        id: "game",
        name: "Tune Street",
        start: { room: "street", items: [] },
        protagonist: { name: PROTAGONIST, model: "character/bartender" },
    });
}

/** Act 1 branches to two endings; nothing in the game changes followers, so ending-a can never be reached. */
export async function unreachableEnding(game: GameClient, projectId: string) {
    await game.save(projectId, "act", { id: "ending-a", name: "A star", goals: [] });
    await game.save(projectId, "act", { id: "ending-b", name: "A band", goals: [] });
    await game.save(projectId, "act", {
        id: "1",
        name: "Act 1",
        goals: [{ id: "enter-shop", name: "Get into the shop" }],
        next: [{ act: "ending-a", when: [{ stat: "followers", atLeast: 10 }] }, { act: "ending-b" }],
    });
}

export async function seededGame(): Promise<{ game: GameClient; projectId: string }> {
    const game = await connectGame();
    const projectId = await newGameProject(game);
    await seedGame(game, projectId);
    return { game, projectId };
}

// ─── The bundle ──────────────────────────────────────────────────────────────

export const CONTENT = "frontend/src/content";

export function bundleFile(files: BundleFile[], path: string): BundleFile {
    const file = files.find((f) => f.path === path);
    if (!file) throw new Error(`The bundle has no ${path}; it has ${files.map((f) => f.path).join(", ")}`);
    return file;
}

export function json<T = Record<string, unknown>>(files: BundleFile[], path: string): T {
    return JSON.parse(bundleFile(files, path).content) as T;
}

// ─── The app's routes ────────────────────────────────────────────────────────

type RouteHandler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** A route module by its path under src/app/api; a variable specifier, so a route not built yet fails the test, not tsc. */
async function appRoute(path: string): Promise<Record<string, RouteHandler>> {
    return import(/* @vite-ignore */ `@/app/api/${path}/route`);
}

async function callRoute(method: "GET" | "PUT", path: string, params: Record<string, string>, query = "", body?: unknown) {
    const handler = (await appRoute(path))[method];
    if (!handler) throw new Error(`${path} has no ${method}`);
    const url = Object.entries(params).reduce((p, [key, value]) => p.replace(`[${key}]`, value), path);
    const req = new NextRequest(`http://localhost/api/${url}${query}`, {
        method,
        headers: { "content-type": "application/json", ...(method === "PUT" && { "x-csrf-protection": "1" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const res = await handler(req, { params: Promise.resolve(params) });
    return { status: res.status, body: await res.json() };
}

/** What the app shows and does, through its routes under /api/projects/[id]/game/. */
export const app = {
    objects: async <K extends Kind>(projectId: string, kind: K): Promise<GameObjectOutput[K][]> => {
        const res = await callRoute("GET", "projects/[id]/game/objects", { id: projectId }, `?kind=${kind}`);
        if (res.status !== 200) throw new Error(`GET objects answered ${res.status}`);
        return res.body.objects;
    },
    save: <K extends Kind>(projectId: string, kind: K, object: GameObjectInput[K]) =>
        callRoute("PUT", "projects/[id]/game/objects/[kind]/[objectId]", { id: projectId, kind, objectId: object.id }, "", object),
    lint: async (projectId: string): Promise<LintResult> => {
        const res = await callRoute("GET", "projects/[id]/game/lint", { id: projectId });
        if (res.status !== 200) throw new Error(`GET lint answered ${res.status}`);
        return res.body;
    },
    exportGame: (projectId: string) => callRoute("GET", "projects/[id]/game/export", { id: projectId }),
};

/** The message the app refuses an object with; it must refuse with 400. */
export async function appRefusal<K extends Kind>(projectId: string, kind: K, object: GameObjectInput[K]): Promise<string> {
    const res = await app.save(projectId, kind, object);
    if (res.status !== 400) throw new Error(`PUT ${kind} answered ${res.status}, not 400`);
    return res.body.error;
}
