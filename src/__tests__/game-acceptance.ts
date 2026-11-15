/**
 * Harness for the game-authoring acceptance tests (#1501): the contract that the
 * game-world-model, game-scenes-and-hotspots, game-dialogue, game-linter, game-export and
 * game-import specs are built against (#1502–#1508). Tests reach the game only through
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

export interface FloorPoint { x: number; y: number }
export type FlagValue = boolean | number | string;

export type Condition =
    | { has: string }
    | { pickedUp: string }
    | { gathered: string }
    | { flag: string; is?: FlagValue }
    | { stat: string; atLeast: number }
    | { act: string }
    | { goal: string }
    | { visited: string }
    | { world: string }
    | { not: Condition };

/** Each effect, keyed by its name: the key it carries. */
interface EffectShapes {
    say: { say: string; by?: string };
    goTo: { goTo: string; at?: FloorPoint };
    goBack: { goBack: true };
    wait: { wait: number };
    pickUp: { pickUp: string };
    give: { give: string };
    take: { take: string };
    gather: { gather: string };
    set: { set: string; to: FlagValue };
    talk: { talk: string };
    changeStat: { changeStat: string; by: number };
    reachGoal: { reachGoal: string };
}

export type Effect = EffectShapes[keyof EffectShapes];
export type EffectName = keyof EffectShapes;

const effectNames: { [K in EffectName]: K extends keyof EffectShapes[K] ? true : never } = {
    say: true, goTo: true, goBack: true, wait: true, pickUp: true, give: true,
    take: true, gather: true, set: true, talk: true, changeStat: true, reachGoal: true,
};

export const EFFECT_NAMES = Object.keys(effectNames) as EffectName[];

export interface Reaction { when?: Condition[]; effects: Effect[] }

export interface Interaction {
    verb: "look" | "use" | "talk" | "pickup" | "go";
    item?: string;
    when?: Condition[];
    effects: Effect[];
}

export type HotspotTarget = { entity: string; at: FloorPoint } | { node: string };

export interface Hotspot {
    id: string;
    name: string;
    verb: string;
    target: HotspotTarget;
    walkTo: FloorPoint;
    interactions: Interaction[];
    presentWhen?: Condition[];
}

// ─── Game objects, by kind ───────────────────────────────────────────────────

/** The project's one `game` object: what manifest.json and the protagonist are made from. */
export interface GameSettings {
    id: "game";
    name: string;
    start: { room: string; items: string[] };
    protagonist: { name: string; model: string };
}

export interface Item { id: string; name: string; noUse: string; uses?: { item: string; when?: Condition[]; effects: Effect[] }[]; onUse?: Reaction[] }
export interface Flag { id: string; description?: string }
export interface Stat { id: string; name: string; start: number }
export interface Act { id: string; name: string; goals: { id: string; name: string }[]; next?: { act: string; when?: Condition[] }[] }
export interface World { id: string; name: string; start: string; locked?: string; unlockWhen?: Condition[] }
/** `requires` makes it available, `solvedWhen` marks it done, `grants` runs when it is. */
export interface Puzzle { id: string; name: string; requires: Condition[]; solvedWhen: Condition; grants: Effect[] }
export interface Character { id: string; name: string; model: string; onGoal?: Reaction[] }
export interface Prop { id: string; name: string; model: string }

export interface Model {
    id: string;
    kind: "scene" | "character" | "object";
    /** Its path under the bundle's frontend/public/. */
    file: string;
    height?: number;
    artSpec: { prompt: string; notes: string; referenceImages: string[] };
    status: "placeholder" | "in progress" | "final";
    /** The model file, base64; write-only. */
    fileData?: string;
}

export interface Room {
    id: string;
    world: string;
    model: string;
    label: string;
    place: { verb: string; name: string };
    hint: string;
    start: FloorPoint;
    /** The floor: a convex polygon. */
    walkable: FloorPoint[];
    hotspots: Hotspot[];
    onStart?: Reaction[];
}

/**
 * `next` is a node id, or null to end the conversation. The spec's action node is two
 * shapes, so each has its own tag: `action` applies effects, `branch` branches on a condition.
 */
export type DialogueNode =
    | { id: string; type: "line"; speaker: string; text: string; next: string | null }
    | { id: string; type: "choice"; options: { text: string; when?: Condition[]; next: string | null }[] }
    | { id: string; type: "action"; effects: Effect[]; next: string | null }
    | { id: string; type: "branch"; if: Condition[]; then: string | null; else: string | null }
    | ImprovNode;

/** The fallback is not one of `outcomes`: it is what the node does at the turn limit or without the AI. */
export interface ImprovNode {
    id: string;
    type: "improv";
    persona: string;
    knows: string;
    mustNotReveal: string;
    mustSay: { text: string; unlessHas?: string }[];
    goal: string;
    escalation: string[];
    outcomes: { id: string; when: string; effects: Effect[]; next: string | null }[];
    fallback?: { effects: Effect[]; next: string | null };
    canned: string;
    turnLimit?: number;
}

export interface Conversation { id: string; character: string; entry: string; nodes: DialogueNode[] }

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
    model: Omit<Model, "fileData"> & { placeholder: boolean };
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

/**
 * Supabase Storage held in memory, for model files and snapshot screenshots. An
 * implementation that keeps model files there reads them back with `downloadObject`,
 * which the storage module does not have yet.
 */
const stored = new Map<string, Buffer>();

type StorageModule = typeof import("@/lib/storage/object-storage");

export function fakeStorage(actual: StorageModule): StorageModule & { downloadObject(path: string): Promise<Buffer> } {
    const signed = (path: string) => `https://storage.test/signed/${path}?token=t`;
    return {
        ...actual,
        uploadObject: vi.fn(async (path: string, data: Buffer) => { stored.set(path, data); }),
        createSignedUrl: vi.fn(async (path: string) => signed(path)),
        createSignedUrls: vi.fn(async (paths: string[]) => new Map(paths.map((p) => [p, signed(p)]))),
        removeObjects: vi.fn(async (paths: string[]) => { for (const p of paths) stored.delete(p); }),
        downloadObject: vi.fn(async (path: string) => {
            const data = stored.get(path);
            if (!data) throw new Error(`No stored object at ${path}`);
            return data;
        }),
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

/** A rectangle of floor, 1280 × 640 scene pixels being the whole scene. */
export const FLOOR: FloorPoint[] = [
    { x: 100, y: 560 },
    { x: 1180, y: 560 },
    { x: 1180, y: 630 },
    { x: 100, y: 630 },
];

const FILE_DATA = Buffer.from("glTF").toString("base64");

export function model(id: string, overrides: Partial<Model> = {}): Model {
    const [kind, name] = id.split("/") as [Model["kind"], string];
    return {
        id,
        kind,
        file: `models/${kind}s/${name}.glb`,
        artSpec: { prompt: `A ${name}`, notes: "", referenceImages: [] },
        status: "final",
        fileData: FILE_DATA,
        ...overrides,
    };
}

export function room(id: string, hotspots: Hotspot[], overrides: Partial<Room> = {}): Room {
    return {
        id,
        world: "street",
        model: `scene/${id}`,
        label: `PUNLAND · ${id.toUpperCase()}`,
        place: { verb: "On", name: id },
        hint: `The ${id}.`,
        start: { x: 640, y: 600 },
        walkable: FLOOR,
        hotspots,
        ...overrides,
    };
}

export const FLYER: Hotspot = {
    id: "flyer",
    name: "Flyer",
    verb: "Pick up",
    target: { entity: "flyer", at: { x: 300, y: 600 } },
    walkTo: { x: 300, y: 600 },
    interactions: [{ verb: "pickup", effects: [{ pickUp: "map" }, { set: "door-open", to: true }] }],
};

export const DOOR: Hotspot = {
    id: "door",
    name: "Shop door",
    verb: "Go in",
    target: { node: "door" },
    walkTo: { x: 1100, y: 600 },
    interactions: [{ verb: "go", when: [{ flag: "door-open" }], effects: [{ goTo: "shop", at: { x: 600, y: 600 } }] }],
};

export const COUNTER: Hotspot = {
    id: "counter",
    name: "Bartender",
    verb: "Talk to",
    target: { entity: "bartender", at: { x: 900, y: 600 } },
    walkTo: { x: 850, y: 600 },
    interactions: [{ verb: "talk", when: [{ has: "map" }], effects: [{ say: "Welcome", by: "bartender" }, { reachGoal: "enter-shop" }] }],
};

export function improvNode(overrides: Partial<ImprovNode> = {}): ImprovNode {
    return {
        id: "improv",
        type: "improv",
        persona: "A dry, kind crow who tends the bar.",
        knows: "Everyone who has played here.",
        mustNotReveal: "That the kitchen is hiring.",
        mustSay: [],
        goal: "promise to put in a word",
        escalation: ["polite", "pushy", "desperate"],
        outcomes: [{ id: "promised", when: "she promises to put in a word", effects: [], next: null }],
        fallback: { effects: [], next: null },
        canned: "Busy night, kid. Come back later.",
        turnLimit: 8,
        ...overrides,
    };
}

export const PROTAGONIST = "Mo";

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
