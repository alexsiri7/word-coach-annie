import type { Condition, Effect, GameObjectEntry, Path, Puzzle } from "@/schemas/game-objects";

/** What a rule can name: an object of one of these kinds, or a goal of any act. */
export type ReferenceKind = "item" | "flag" | "stat" | "act" | "goal" | "room" | "world" | "character";

export interface Reference {
    kind: ReferenceKind;
    id: string;
    path: Path;
}

type Reaction = { when?: Condition[]; effects: Effect[] };

function conditionRefs(condition: Condition, path: Path): Reference[] {
    const ref = (kind: ReferenceKind, id: string, name: string): Reference[] => [{ kind, id, path: [...path, name] }];
    if ("has" in condition) return ref("item", condition.has, "has");
    if ("pickedUp" in condition) return ref("item", condition.pickedUp, "pickedUp");
    if ("flag" in condition) return ref("flag", condition.flag, "flag");
    if ("stat" in condition) return ref("stat", condition.stat, "stat");
    if ("act" in condition) return ref("act", condition.act, "act");
    if ("goal" in condition) return ref("goal", condition.goal, "goal");
    if ("visited" in condition) return ref("room", condition.visited, "visited");
    if ("world" in condition) return ref("world", condition.world, "world");
    if ("not" in condition) return conditionRefs(condition.not, [...path, "not"]);
    // `gathered` names free-text material, not an object.
    return [];
}

function effectRefs(effect: Effect, path: Path): Reference[] {
    const ref = (kind: ReferenceKind, id: string, name: string): Reference[] => [{ kind, id, path: [...path, name] }];
    if ("say" in effect) return effect.by === undefined ? [] : ref("character", effect.by, "by");
    if ("goTo" in effect) return ref("room", effect.goTo, "goTo");
    if ("pickUp" in effect) return ref("item", effect.pickUp, "pickUp");
    if ("give" in effect) return ref("item", effect.give, "give");
    if ("take" in effect) return ref("item", effect.take, "take");
    if ("set" in effect) return ref("flag", effect.set, "set");
    if ("talk" in effect) return ref("character", effect.talk, "talk");
    if ("changeStat" in effect) return ref("stat", effect.changeStat, "changeStat");
    if ("reachGoal" in effect) return ref("goal", effect.reachGoal, "reachGoal");
    return [];
}

const conditionsRefs = (conditions: Condition[] | undefined, path: Path) =>
    (conditions ?? []).flatMap((c, i) => conditionRefs(c, [...path, i]));

const effectsRefs = (effects: Effect[], path: Path) => effects.flatMap((e, i) => effectRefs(e, [...path, i]));

const reactionRefs = (reaction: Reaction, path: Path) => [
    ...conditionsRefs(reaction.when, [...path, "when"]),
    ...effectsRefs(reaction.effects, [...path, "effects"]),
];

const reactionsRefs = (reactions: Reaction[] | undefined, path: Path) =>
    (reactions ?? []).flatMap((r, i) => reactionRefs(r, [...path, i]));

/**
 * Every object a game object's rules name, with where it names it. References the linter
 * owns (a world's start room, a room's model, a dialogue node's next…) are not rules and
 * are not listed.
 */
export function referencesOf({ kind, object }: GameObjectEntry): Reference[] {
    switch (kind) {
        case "item":
            return [
                ...(object.uses ?? []).flatMap((use, i) => [
                    { kind: "item" as const, id: use.item, path: ["uses", i, "item"] },
                    ...reactionRefs(use, ["uses", i]),
                ]),
                ...reactionsRefs(object.onUse, ["onUse"]),
            ];
        case "act":
            return (object.next ?? []).flatMap((next, i) => [
                { kind: "act" as const, id: next.act, path: ["next", i, "act"] },
                ...conditionsRefs(next.when, ["next", i, "when"]),
            ]);
        case "world":
            return conditionsRefs(object.unlockWhen, ["unlockWhen"]);
        case "puzzle":
            return [
                ...conditionsRefs(object.requires, ["requires"]),
                ...conditionRefs(object.solvedWhen, ["solvedWhen"]),
                ...effectsRefs(object.grants, ["grants"]),
            ];
        case "character":
            return reactionsRefs(object.onGoal, ["onGoal"]);
        case "room":
            return [
                ...object.hotspots.flatMap((hotspot, h) => [
                    ...hotspot.interactions.flatMap((interaction, i) => {
                        const path = ["hotspots", h, "interactions", i];
                        return [
                            ...(interaction.item === undefined ? [] : [{ kind: "item" as const, id: interaction.item, path: [...path, "item"] }]),
                            ...reactionRefs(interaction, path),
                        ];
                    }),
                    ...conditionsRefs(hotspot.presentWhen, ["hotspots", h, "presentWhen"]),
                ]),
                ...reactionsRefs(object.onStart, ["onStart"]),
            ];
        case "conversation":
            return object.nodes.flatMap((node, n) => {
                const path = ["nodes", n];
                switch (node.type) {
                    case "choice":
                        return node.options.flatMap((option, i) => conditionsRefs(option.when, [...path, "options", i, "when"]));
                    case "action":
                        return effectsRefs(node.effects, [...path, "effects"]);
                    case "branch":
                        return conditionsRefs(node.if, [...path, "if"]);
                    case "improv":
                        return [
                            ...node.outcomes.flatMap((outcome, i) => effectsRefs(outcome.effects, [...path, "outcomes", i, "effects"])),
                            ...(node.fallback ? effectsRefs(node.fallback.effects, [...path, "fallback", "effects"]) : []),
                        ];
                    case "line":
                        return [];
                }
            });
        case "game":
        case "flag":
        case "stat":
        case "object":
        case "model":
            return [];
    }
}

/** Puzzles depend on each other through flags: one's grants set a flag another's requires reads. */
export function puzzleDependencies(puzzles: Puzzle[]): Map<string, { dependsOn: string[]; unlocks: string[] }> {
    const flags = (refs: Reference[]) => new Set(refs.filter((r) => r.kind === "flag").map((r) => r.id));
    const nodes = puzzles.map((p) => ({
        id: p.id,
        sets: flags(effectsRefs(p.grants, [])),
        reads: flags(conditionsRefs(p.requires, [])),
        dependsOn: [] as string[],
        unlocks: [] as string[],
    }));
    for (const puzzle of nodes) {
        for (const other of nodes) {
            if (other === puzzle || ![...other.sets].some((flag) => puzzle.reads.has(flag))) continue;
            puzzle.dependsOn.push(other.id);
            other.unlocks.push(puzzle.id);
        }
    }
    return new Map(nodes.map((p) => [p.id, { dependsOn: p.dependsOn.sort(), unlocks: p.unlocks.sort() }]));
}
