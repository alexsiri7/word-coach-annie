import { z } from "zod";
import { CONDITION_NAMES, EFFECT_NAMES, GAME_OBJECT_KINDS } from "@/schemas/game-objects";
import { defineTool } from "./types";

const GAME_OBJECT_KIND = z.enum(GAME_OBJECT_KINDS).describe(`The object's kind: ${GAME_OBJECT_KINDS.join(", ")}`);
const GAME_RULES = `Conditions are objects keyed by one name: ${CONDITION_NAMES.join(", ")} (e.g. { has: "map" }, { flag: "door-open", is: true }, { stat: "followers", atLeast: 10 }, { not: { visited: "shop" } }). Effects likewise: ${EFFECT_NAMES.join(", ")} (e.g. { say: "Hi", by: "bartender" }, { goTo: "shop", at: { x, y } }, { set: "door-open", to: true }, { changeStat: "followers", by: 1 }). A rule may name only objects the game already has.`;

export const listGameObjectsSpec = defineTool({
    name: "list_game_objects",
    description: "List a GAME project's objects of one kind, in the order they were added. Acts also carry read-only final (no next entries: an ending); puzzles carry read-only dependsOn and unlocks (puzzle ids, through the flags one's grants set and another's requires read).",
    destructive: false,
    parameters: z.object({
        projectId: z.string().describe("The GAME project ID"),
        kind: GAME_OBJECT_KIND,
    }),
});

export const getGameObjectSpec = defineTool({
    name: "get_game_object",
    description: "Read one object of a GAME project by kind and id.",
    destructive: false,
    parameters: z.object({
        projectId: z.string().describe("The GAME project ID"),
        kind: GAME_OBJECT_KIND,
        id: z.string().describe("The object's id"),
    }),
});

export const saveGameObjectSpec = defineTool({
    name: "save_game_object",
    description: `Create or replace an object of a GAME project: the one with the same kind and id is replaced whole. Objects keep the Punland engine's shapes plus an id: item { id, name, noUse, uses?, onUse? }, flag { id, description? }, stat { id, name, start }, act { id, name, goals: [{ id, name }], next?: [{ act, when? }] } (an act that is not final needs a last next entry without a condition), world { id, name, start, locked?, unlockWhen? }, puzzle { id, name, requires, solvedWhen, grants }; rooms hold hotspots whose interactions are { verb: look|use|talk|pickup|go, item (only with use), when?, effects }. ${GAME_RULES} Read-only fields a read returns (final, dependsOn, unlocks) are ignored.`,
    destructive: false,
    parameters: z.object({
        projectId: z.string().describe("The GAME project ID"),
        kind: GAME_OBJECT_KIND,
        object: z.record(z.string(), z.unknown()).describe("The object, with its id"),
    }),
});

export const deleteGameObjectSpec = defineTool({
    name: "delete_game_object",
    description: "Delete an object of a GAME project. If other objects' rules name it, nothing is deleted: the result is { deleted: false, usedBy: [{ kind, id, field }] }; show the author where it is used and call again with confirm: true once they agree. Cannot be undone.",
    destructive: true,
    parameters: z.object({
        projectId: z.string().describe("The GAME project ID"),
        kind: GAME_OBJECT_KIND,
        id: z.string().describe("The object's id"),
        confirm: z.boolean().optional().describe("Delete even though other objects use it"),
    }),
});
