import type { Prisma } from "@prisma/client";
import { prisma, type DbClient } from "@/lib/db";
import { NotFoundError, UserFacingError } from "@/lib/controllers/errors";
import { runSerializable } from "@/lib/controllers/serializable";
import { puzzleDependencies, referencesOf, type ReferenceKind } from "@/lib/game/references";
import {
    DERIVED_FIELDS,
    formatPath,
    GameObjectEntrySchema,
    isGameObjectKind,
    parseGameObject,
    unknownKindMessage,
    type Act,
    type GameObject,
    type GameObjectEntry,
    type GameObjectKind,
    type Puzzle,
} from "@/schemas/game-objects";

/** What a read returns: the object, plus what Annie derives for acts and puzzles. */
export type GameObjectView =
    | GameObject
    | (Act & { final: boolean })
    | (Puzzle & { dependsOn: string[]; unlocks: string[] });

export interface UsedBy {
    kind: GameObjectKind;
    id: string;
    field: string;
}

type Row = { kind: string; key: string; data: Prisma.JsonValue };

const CONFLICT = "This game changed at the same time; please try again";

function checkedKind(kind: string): GameObjectKind {
    if (!isGameObjectKind(kind)) throw new UserFacingError(unknownKindMessage(kind));
    return kind;
}

/** A stored row as the object it holds: its data with its id. */
export function storedObject(row: { key: string; data: Prisma.JsonValue }): Prisma.JsonObject {
    const data = typeof row.data === "object" && row.data !== null && !Array.isArray(row.data) ? row.data : {};
    return { ...data, id: row.key };
}

/** Rows are written only through parseGameObject, so a stored object is read with the same schema. */
function entryOf(row: Row): GameObjectEntry {
    return GameObjectEntrySchema.parse({ kind: row.kind, object: storedObject(row) });
}

function withoutDerived(kind: GameObjectKind, input: unknown): unknown {
    const derived = DERIVED_FIELDS[kind];
    if (!derived || typeof input !== "object" || input === null || Array.isArray(input)) return input;
    return Object.fromEntries(Object.entries(input).filter(([key]) => !derived.includes(key)));
}

function view(entry: GameObjectEntry, puzzles: Puzzle[]): GameObjectView {
    if (entry.kind === "act") return { ...entry.object, final: !entry.object.next?.length };
    if (entry.kind === "puzzle") {
        const { dependsOn, unlocks } = puzzleDependencies(puzzles).get(entry.object.id) ?? { dependsOn: [], unlocks: [] };
        return { ...entry.object, dependsOn, unlocks };
    }
    return entry.object;
}

const puzzlesOf = (entries: GameObjectEntry[]) => entries.flatMap((e) => (e.kind === "puzzle" ? [e.object] : []));

function rowOrder(a: { createdAt: Date; key: string }, b: { createdAt: Date; key: string }) {
    return a.createdAt.getTime() - b.createdAt.getTime() || a.key.localeCompare(b.key);
}

async function projectEntries(db: DbClient, projectId: string, kind?: GameObjectKind): Promise<GameObjectEntry[]> {
    const rows = await db.gameObject.findMany({
        where: { projectId, ...(kind && { kind }) },
        select: { kind: true, key: true, data: true, createdAt: true },
    });
    return rows.sort(rowOrder).map(entryOf);
}

const isSame = (a: GameObjectEntry, kind: GameObjectKind, id: string) => a.kind === kind && a.object.id === id;

/** The ids of the game's objects, by kind; goals count as a kind, holding every act's goals. */
function existingIds(entries: GameObjectEntry[]): Map<string, Set<string>> {
    const ids = new Map<string, Set<string>>();
    const add = (kind: string, id: string) => ids.set(kind, (ids.get(kind) ?? new Set()).add(id));
    for (const entry of entries) {
        add(entry.kind, entry.object.id);
        if (entry.kind === "act") entry.object.goals.forEach((goal) => add("goal", goal.id));
    }
    return ids;
}

function checkGoalsAreUnique(act: Act, others: GameObjectEntry[]) {
    const owner = new Map<string, string>();
    for (const other of others) if (other.kind === "act") other.object.goals.forEach((goal) => owner.set(goal.id, other.object.id));
    act.goals.forEach((goal, i) => {
        const taken = owner.get(goal.id);
        if (taken !== undefined) {
            throw new UserFacingError(`${formatPath(["goals", i, "id"], act)}: goal "${goal.id}" already belongs to act "${taken}"`);
        }
    });
}

/** A rule may name only objects the game has, the object being saved included. */
function checkReferences(entry: GameObjectEntry, game: GameObjectEntry[]) {
    const ids = existingIds(game);
    const missing = referencesOf(entry).find((ref) => !ids.get(ref.kind)?.has(ref.id));
    if (missing) {
        throw new UserFacingError(`${formatPath(missing.path, entry.object)}: there is no ${missing.kind} "${missing.id}" in this game`);
    }
}

/** Where other objects' rules name an object, for a deletion to show the author. */
function usesOf(target: GameObjectEntry, others: GameObjectEntry[]): UsedBy[] {
    const goals = new Set(target.kind === "act" ? target.object.goals.map((g) => g.id) : []);
    const names = (kind: ReferenceKind, id: string) => (kind === target.kind && id === target.object.id) || (kind === "goal" && goals.has(id));
    return others.flatMap((other) =>
        referencesOf(other)
            .filter((ref) => names(ref.kind, ref.id))
            .map((ref) => ({ kind: other.kind, id: other.object.id, field: formatPath(ref.path, other.object) })),
    );
}

/** An act saved without a goal it had would leave the rules that name that goal pointing at nothing. */
function checkDroppedGoals(act: Act, stored: GameObjectEntry | undefined, others: GameObjectEntry[]) {
    if (stored?.kind !== "act") return;
    const kept = new Set(act.goals.map((goal) => goal.id));
    const dropped = new Set(stored.object.goals.map((goal) => goal.id).filter((id) => !kept.has(id)));
    for (const other of others) {
        const ref = referencesOf(other).find((r) => r.kind === "goal" && dropped.has(r.id));
        if (ref) {
            throw new UserFacingError(
                `goals: goal "${ref.id}" is still named by ${other.kind} "${other.object.id}" at ${formatPath(ref.path, other.object)}`,
            );
        }
    }
}

/**
 * Checks a whole game at once, as an import brings it: no object twice, no goal in two
 * acts, and every rule naming an object the game has.
 */
export function checkGame(entries: GameObjectEntry[]) {
    entries.forEach((entry, i) => {
        const earlier = entries.slice(0, i);
        const { kind, object } = entry;
        if (earlier.some((e) => isSame(e, kind, object.id))) throw new UserFacingError(`there are two of ${kind} "${object.id}"`);
        try {
            if (entry.kind === "act") checkGoalsAreUnique(entry.object, earlier);
            checkReferences(entry, entries);
        } catch (error) {
            if (error instanceof UserFacingError) throw new UserFacingError(`${kind} "${object.id}": ${error.message}`);
            throw error;
        }
    });
}

export class GameObjectsController {
    static async list(projectId: string, kind: string): Promise<GameObjectView[]> {
        const entries = await projectEntries(prisma, projectId, checkedKind(kind));
        const puzzles = puzzlesOf(entries);
        return entries.map((entry) => view(entry, puzzles));
    }

    static async get(projectId: string, kind: string, id: string): Promise<GameObjectView> {
        const checked = checkedKind(kind);
        const row = await prisma.gameObject.findUnique({
            where: { projectId_kind_key: { projectId, kind: checked, key: id } },
            select: { kind: true, key: true, data: true },
        });
        if (!row) throw new NotFoundError(`There is no ${checked} "${id}" in this game`);
        const puzzles = checked === "puzzle" ? puzzlesOf(await projectEntries(prisma, projectId, "puzzle")) : [];
        return view(entryOf(row), puzzles);
    }

    /** Creates or replaces the object of its kind with its id; the last write wins. */
    static async save(projectId: string, kind: string, input: unknown): Promise<GameObjectView> {
        const checked = checkedKind(kind);
        const parsed = parseGameObject(checked, withoutDerived(checked, input));
        if (!parsed.success) throw new UserFacingError(parsed.error);
        const { entry } = parsed;
        const { id, ...data } = entry.object;

        return runSerializable("game object save conflict", CONFLICT, { projectId, kind: checked, id }, async (tx) => {
            const project = await tx.project.findUnique({ where: { id: projectId }, select: { projectType: true } });
            if (!project) throw new NotFoundError("Project not found");
            if (project.projectType !== "GAME") {
                throw new UserFacingError(`Game objects belong to game projects; this is a ${project.projectType} project`);
            }
            const entries = await projectEntries(tx, projectId);
            const others = entries.filter((e) => !isSame(e, checked, id));
            if (entry.kind === "act") {
                checkGoalsAreUnique(entry.object, others);
                checkDroppedGoals(entry.object, entries.find((e) => isSame(e, checked, id)), others);
            }
            const game = [...others, entry];
            checkReferences(entry, game);

            const json = data as Prisma.InputJsonObject;
            await tx.gameObject.upsert({
                where: { projectId_kind_key: { projectId, kind: checked, key: id } },
                create: { projectId, kind: checked, key: id, data: json },
                update: { data: json },
            });
            return view(entry, puzzlesOf(game));
        });
    }

    /**
     * Deletes an object, unless other objects' rules name it and the author has not
     * confirmed: then nothing changes and `usedBy` lists where it is used.
     */
    static async delete(projectId: string, kind: string, id: string, confirm = false): Promise<{ deleted: boolean; usedBy: UsedBy[] }> {
        const checked = checkedKind(kind);
        return runSerializable("game object delete conflict", CONFLICT, { projectId, kind: checked, id }, async (tx) => {
            const entries = await projectEntries(tx, projectId);
            const target = entries.find((e) => isSame(e, checked, id));
            if (!target) throw new NotFoundError(`There is no ${checked} "${id}" in this game`);
            const usedBy = usesOf(target, entries.filter((e) => e !== target));
            if (usedBy.length > 0 && !confirm) return { deleted: false, usedBy };

            await tx.gameObject.delete({ where: { projectId_kind_key: { projectId, kind: checked, key: id } } });
            return { deleted: true, usedBy };
        });
    }
}
