import { z } from "zod";

/**
 * The objects of a GAME project's world model (#1502), in the shapes of the Punland engine
 * (alexsiri7/punland frontend/src/domain/content.ts) plus an `id`. Conditions and effects
 * are limited to the engine's vocabulary, listed here in the engine's order.
 */

export const GAME_OBJECT_KINDS = [
  "game", "item", "flag", "stat", "act", "world", "puzzle", "character", "object", "model", "room", "conversation",
] as const;
export type GameObjectKind = (typeof GAME_OBJECT_KINDS)[number];

export function isGameObjectKind(kind: string): kind is GameObjectKind {
  return (GAME_OBJECT_KINDS as readonly string[]).includes(kind);
}

export function unknownKindMessage(kind: string): string {
  return `Unknown game object kind "${kind}"; the kinds are ${GAME_OBJECT_KINDS.join(", ")}`;
}

export const CONDITION_NAMES = ["has", "pickedUp", "gathered", "flag", "stat", "act", "goal", "visited", "world", "not"] as const;
export const EFFECT_NAMES = [
  "say", "goTo", "goBack", "wait", "pickUp", "give", "take", "gather", "set", "talk", "changeStat", "reachGoal",
] as const;
export const VERBS = ["look", "use", "talk", "pickup", "go"] as const;

/** Fields a read returns but Annie derives, so a write ignores them. */
export const DERIVED_FIELDS: Partial<Record<GameObjectKind, readonly string[]>> = {
  act: ["final"],
  puzzle: ["dependsOn", "unlocks"],
};

const Id = z
  .string()
  .min(1, "An id is required")
  .refine((id) => id.trim() === id, "An id cannot start or end with a space");
const Name = z.string().min(1, "A name is required");
const FloorPoint = z.strictObject({ x: z.number(), y: z.number() });
const FlagValue = z.union([z.boolean(), z.number(), z.string()]);

export type FloorPoint = z.infer<typeof FloorPoint>;
export type FlagValue = z.infer<typeof FlagValue>;

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

export type Effect =
  | { say: string; by?: string }
  | { goTo: string; at?: FloorPoint }
  | { goBack: true }
  | { wait: number }
  | { pickUp: string }
  | { give: string }
  | { take: string }
  | { gather: string }
  | { set: string; to: FlagValue }
  | { talk: string }
  | { changeStat: string; by: number }
  | { reachGoal: string };

/**
 * A condition or effect is an object keyed by its name. The name is found first, so an
 * unknown one is refused with the whole vocabulary rather than a union's generic message.
 */
function named<T, N extends string>(noun: "condition" | "effect", names: readonly N[], shapes: Record<N, z.ZodType<T>>) {
  const isName = (key: string): key is N => (names as readonly string[]).includes(key);
  const list = names.join(", ");
  const one = noun === "effect" ? "an effect" : "a condition";
  return z.unknown().transform((value, ctx): T => {
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).length === 0) {
      ctx.addIssue({ code: "custom", message: `${one} needs one of the names ${list}` });
      return z.NEVER;
    }
    const keys = Object.keys(value);
    const found = keys.filter(isName);
    if (found.length === 0) {
      ctx.addIssue({ code: "custom", message: `unknown ${noun} "${keys[0]}"; the ${noun}s are ${list}` });
      return z.NEVER;
    }
    if (found.length > 1) {
      ctx.addIssue({ code: "custom", message: `${one} has one name; this one has ${found.join(" and ")}` });
      return z.NEVER;
    }
    const parsed = shapes[found[0]].safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
      return z.NEVER;
    }
    return parsed.data;
  });
}

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  named<Condition, (typeof CONDITION_NAMES)[number]>("condition", CONDITION_NAMES, {
    has: z.strictObject({ has: Id }),
    pickedUp: z.strictObject({ pickedUp: Id }),
    gathered: z.strictObject({ gathered: Name }),
    flag: z.strictObject({ flag: Id, is: FlagValue.optional() }),
    stat: z.strictObject({ stat: Id, atLeast: z.number() }),
    act: z.strictObject({ act: Id }),
    goal: z.strictObject({ goal: Id }),
    visited: z.strictObject({ visited: Id }),
    world: z.strictObject({ world: Id }),
    not: z.strictObject({ not: ConditionSchema }),
  }),
);

export const EffectSchema: z.ZodType<Effect> = named<Effect, (typeof EFFECT_NAMES)[number]>("effect", EFFECT_NAMES, {
  say: z.strictObject({ say: z.string(), by: Id.optional() }),
  goTo: z.strictObject({ goTo: Id, at: FloorPoint.optional() }),
  goBack: z.strictObject({ goBack: z.literal(true) }),
  wait: z.strictObject({ wait: z.number().min(0) }),
  pickUp: z.strictObject({ pickUp: Id }),
  give: z.strictObject({ give: Id }),
  take: z.strictObject({ take: Id }),
  gather: z.strictObject({ gather: Name }),
  set: z.strictObject({ set: Id, to: FlagValue }),
  talk: z.strictObject({ talk: Id }),
  changeStat: z.strictObject({ changeStat: Id, by: z.number() }),
  reachGoal: z.strictObject({ reachGoal: Id }),
});

const Conditions = z.array(ConditionSchema);
const Effects = z.array(EffectSchema);
const Reaction = z.strictObject({ when: Conditions.optional(), effects: Effects });

const Interaction = z
  .strictObject({ verb: z.enum(VERBS), item: Id.optional(), when: Conditions.optional(), effects: Effects })
  .superRefine((interaction, ctx) => {
    if (interaction.verb === "use" && interaction.item === undefined) {
      ctx.addIssue({ code: "custom", message: "a use interaction needs the item it uses", path: ["item"] });
    }
    if (interaction.verb !== "use" && interaction.item !== undefined) {
      ctx.addIssue({ code: "custom", message: "only a use interaction has an item", path: ["item"] });
    }
  });

const Hotspot = z.strictObject({
  id: Id,
  name: Name,
  verb: z.string(),
  target: z.union([z.strictObject({ entity: Id, at: FloorPoint }), z.strictObject({ node: Id })]),
  walkTo: FloorPoint,
  interactions: z.array(Interaction),
  presentWhen: Conditions.optional(),
});

const GameSettings = z.strictObject({
  id: z.literal("game"),
  name: Name,
  start: z.strictObject({ room: Id, items: z.array(Id) }),
  protagonist: z.strictObject({ name: Name, model: Id }),
});

const Item = z.strictObject({
  id: Id,
  name: Name,
  noUse: Name,
  uses: z.array(z.strictObject({ item: Id, when: Conditions.optional(), effects: Effects })).optional(),
  onUse: z.array(Reaction).optional(),
});

const Flag = z.strictObject({ id: Id, description: z.string().optional() });

const Stat = z.strictObject({ id: Id, name: Name, start: z.number() });

const Act = z
  .strictObject({
    id: Id,
    name: Name,
    goals: z.array(z.strictObject({ id: Id, name: Name })),
    next: z.array(z.strictObject({ act: Id, when: Conditions.optional() })).optional(),
  })
  .superRefine((act, ctx) => {
    const seen = new Set<string>();
    act.goals.forEach((goal, i) => {
      if (seen.has(goal.id)) ctx.addIssue({ code: "custom", message: `goal "${goal.id}" is listed twice`, path: ["goals", i, "id"] });
      seen.add(goal.id);
    });
    const last = act.next?.length ? act.next.length - 1 : -1;
    if (last >= 0 && act.next?.[last].when?.length) {
      ctx.addIssue({
        code: "custom",
        message: `Act "${act.id}" can get stuck: it is not final, so the last of its next entries must have no condition`,
        path: ["next", last, "when"],
      });
    }
  });

const World = z
  .strictObject({ id: Id, name: Name, start: Id, locked: z.string().optional(), unlockWhen: Conditions.optional() })
  .superRefine((world, ctx) => {
    if (world.unlockWhen !== undefined && world.locked === undefined) {
      ctx.addIssue({ code: "custom", message: "only a locked world has unlock conditions", path: ["unlockWhen"] });
    }
  });

const Puzzle = z.strictObject({ id: Id, name: Name, requires: Conditions, solvedWhen: ConditionSchema, grants: Effects });

const Character = z.strictObject({ id: Id, name: Name, model: Id, onGoal: z.array(Reaction).optional() });

const Prop = z.strictObject({ id: Id, name: Name, model: Id });

const Model = z.strictObject({
  id: Id,
  kind: z.enum(["scene", "character", "object"]),
  file: z.string().min(1, "A file is required"),
  height: z.number().optional(),
  artSpec: z.strictObject({ prompt: z.string(), notes: z.string(), referenceImages: z.array(z.string()) }),
  status: z.enum(["placeholder", "in progress", "final"]),
});

const Room = z.strictObject({
  id: Id,
  world: Id,
  model: Id,
  label: z.string(),
  place: z.strictObject({ verb: z.string(), name: z.string() }),
  hint: z.string(),
  start: FloorPoint,
  walkable: z.array(FloorPoint),
  hotspots: z.array(Hotspot),
  onStart: z.array(Reaction).optional(),
});

const Next = Id.nullable();

const DialogueNode = z.discriminatedUnion("type", [
  z.strictObject({ id: Id, type: z.literal("line"), speaker: Id, text: z.string(), next: Next }),
  z.strictObject({
    id: Id,
    type: z.literal("choice"),
    options: z.array(z.strictObject({ text: z.string(), when: Conditions.optional(), next: Next })),
  }),
  z.strictObject({ id: Id, type: z.literal("action"), effects: Effects, next: Next }),
  z.strictObject({ id: Id, type: z.literal("branch"), if: Conditions, then: Next, else: Next }),
  z.strictObject({
    id: Id,
    type: z.literal("improv"),
    persona: z.string(),
    knows: z.string(),
    mustNotReveal: z.string(),
    mustSay: z.array(z.strictObject({ text: z.string(), unlessHas: Id.optional() })),
    goal: z.string(),
    escalation: z.array(z.string()),
    outcomes: z.array(z.strictObject({ id: Id, when: z.string(), effects: Effects, next: Next })),
    fallback: z.strictObject({ effects: Effects, next: Next }).optional(),
    canned: z.string(),
    turnLimit: z.number().int().positive().optional(),
  }),
]);

const Conversation = z.strictObject({ id: Id, character: Id, entry: Id, nodes: z.array(DialogueNode) });

function entry<K extends GameObjectKind, S extends z.ZodType>(kind: K, object: S) {
  return z.object({ kind: z.literal(kind), object });
}

/** A game object with its kind, so code that reads one narrows on the kind. */
export const GameObjectEntrySchema = z.discriminatedUnion("kind", [
  entry("game", GameSettings),
  entry("item", Item),
  entry("flag", Flag),
  entry("stat", Stat),
  entry("act", Act),
  entry("world", World),
  entry("puzzle", Puzzle),
  entry("character", Character),
  entry("object", Prop),
  entry("model", Model),
  entry("room", Room),
  entry("conversation", Conversation),
]);

export type GameObjectEntry = z.infer<typeof GameObjectEntrySchema>;
export type GameObject = GameObjectEntry["object"];
export type Act = z.infer<typeof Act>;
export type Puzzle = z.infer<typeof Puzzle>;

export type Path = readonly (string | number)[];

/**
 * A path in an object as `a.b[0].c`, with a hotspot's index replaced by its id
 * (`hotspots[door].interactions[0]`) so the author can find it.
 */
export function formatPath(path: Path, object: unknown): string {
  let at: unknown = object;
  let out = "";
  path.forEach((segment, i) => {
    const next: unknown = typeof at === "object" && at !== null ? Reflect.get(at, segment) : undefined;
    if (typeof segment === "string") out += out ? `.${segment}` : segment;
    else out += `[${path[i - 1] === "hotspots" ? hotspotLabel(next, segment) : segment}]`;
    at = next;
  });
  return out;
}

function hotspotLabel(hotspot: unknown, index: number): string | number {
  const id = typeof hotspot === "object" && hotspot !== null ? Reflect.get(hotspot, "id") : undefined;
  return typeof id === "string" && id ? id : index;
}

export type ParsedGameObject = { success: true; entry: GameObjectEntry } | { success: false; error: string };

/** Validates an object of a kind; a refusal names the first problem as `field: message`. */
export function parseGameObject(kind: GameObjectKind, object: unknown): ParsedGameObject {
  const parsed = GameObjectEntrySchema.safeParse({ kind, object });
  if (parsed.success) return { success: true, entry: parsed.data };
  const issue = parsed.error.issues[0];
  if (!issue) return { success: false, error: "Invalid game object" };
  // The entry's own path starts at `object`.
  const path = issue.path.slice(1).filter((segment) => typeof segment !== "symbol");
  const where = formatPath(path, object);
  return { success: false, error: where ? `${where}: ${issue.message}` : issue.message };
}
