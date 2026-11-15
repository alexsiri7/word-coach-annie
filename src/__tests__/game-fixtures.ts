/**
 * The fixtures of the game-authoring acceptance tests that have no side effects, so the
 * Playwright suite (e2e/integration.spec.ts) imports the same values as the vitest one
 * instead of retyping them. Nothing here may import vitest, Prisma or the MCP server.
 */
import type { FloorPoint, Hotspot, ImprovNode, Model, Room } from "./game-acceptance";

/** A rectangle of floor, 1280 × 640 scene pixels being the whole scene. */
export const FLOOR: FloorPoint[] = [
    { x: 100, y: 560 },
    { x: 1180, y: 560 },
    { x: 1180, y: 630 },
    { x: 100, y: 630 },
];

export function model(id: string, overrides: Partial<Model> = {}): Model {
    const [kind, name] = id.split("/") as [Model["kind"], string];
    return {
        id,
        kind,
        file: `models/${kind}s/${name}.glb`,
        artSpec: { prompt: `A ${name}`, notes: "", referenceImages: [] },
        status: "final",
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
