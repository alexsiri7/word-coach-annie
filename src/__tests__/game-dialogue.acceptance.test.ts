// Acceptance tests for openspec/specs/game-dialogue (#1501), one per scenario. Each is `it.fails`
// until #1504 makes it pass; then it becomes `it`. The visual editor's scenarios are in
// e2e/integration.spec.ts (#1505).
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api-auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-auth")>();
    return { ...actual, getCurrentUserId: vi.fn(() => null as string | null) };
});
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/storage/supabase-storage", async (importOriginal) =>
    (await import("./game-acceptance")).fakeStorage(await importOriginal()));

import {
    app, appRefusal, improvNode, seededGame,
    type Condition, type Conversation, type DialogueNode, type GameClient, type PreviewResult, type PreviewStep,
} from "./game-acceptance";

function drinks(waterWhen?: Condition[]): Conversation {
    return {
        id: "drinks",
        character: "bartender",
        entry: "l1",
        nodes: [
            { id: "l1", type: "line", speaker: "bartender", text: "What'll it be?", next: "c1" },
            { id: "c1", type: "choice", options: [{ text: "Water", when: waterWhen, next: "l2" }, { text: "Juice", next: "l3" }] },
            { id: "l2", type: "line", speaker: "bartender", text: "Water it is.", next: null },
            { id: "l3", type: "line", speaker: "bartender", text: "Juice it is.", next: null },
        ],
    };
}

function preview(game: GameClient, projectId: string, conversationId: string, steps: PreviewStep[], state?: { items?: string[] }) {
    return game.call<PreviewResult>("preview_conversation", { projectId, conversationId, steps, state });
}

describe("game-dialogue", () => {
    describe("Requirement: Dialogue graphs", () => {
        it.fails("A scripted exchange", async () => {
            const { game, projectId } = await seededGame();
            await game.save(projectId, "conversation", drinks());

            const played = await preview(game, projectId, "drinks", [{ choose: 1 }]);

            expect(played.transcript.map((line) => line.text)).toEqual(["What'll it be?", "Juice it is."]);
            expect(played.ended).toBe(true);
        });

        it.fails("A choice with a condition", async () => {
            const { game, projectId } = await seededGame();
            await game.save(projectId, "conversation", drinks([{ has: "map" }]));

            const played = await preview(game, projectId, "drinks", [], { items: [] });

            expect(played.awaiting).toEqual({ nodeId: "c1", kind: "choice", options: [{ index: 1, text: "Juice" }] });
        });
    });

    describe("Requirement: Improv nodes", () => {
        it.fails("Defining an improv goal", async () => {
            const { game, projectId } = await seededGame();
            await game.save(projectId, "flag", { id: "staying" });
            await game.save(projectId, "conversation", {
                id: "stay", character: "bartender", entry: "improv",
                nodes: [improvNode({
                    goal: "convince her I am staying",
                    outcomes: [{ id: "stays", when: "she believes he is staying", effects: [{ set: "staying", to: true }], next: null }],
                })],
            });

            const reached = await preview(game, projectId, "stay", []);
            expect(reached.awaiting).toMatchObject({ nodeId: "improv", kind: "improv", outcomes: expect.arrayContaining(["stays"]) });

            const done = await preview(game, projectId, "stay", [{ outcome: "stays" }]);
            expect(done.effects).toEqual([{ set: "staying", to: true }]);
            expect(done.ended).toBe(true);
        });

        it.fails("A conversation that cannot get stuck", async () => {
            const { game, projectId } = await seededGame();
            await game.save(projectId, "conversation", {
                id: "later", character: "bartender", entry: "improv",
                nodes: [
                    improvNode({ fallback: { effects: [], next: "later" } }),
                    { id: "later", type: "line", speaker: "bartender", text: "Come back later", next: null },
                ],
            });

            const fellBack = await preview(game, projectId, "later", [{ outcome: "fallback" }]);

            expect(fellBack.transcript.map((line) => line.text)).toContain("Come back later");
            expect(fellBack.ended).toBe(true);
            const reason = await game.saveRefusal(projectId, "conversation", {
                id: "unlimited", character: "bartender", entry: "pitch", nodes: [improvNode({ id: "pitch", turnLimit: undefined })],
            });
            expect(reason).toContain("pitch");
        });
    });

    describe("Requirement: Agent access", () => {
        it.fails("An agent writes a conversation", async () => {
            const { game, projectId } = await seededGame();

            await game.save(projectId, "conversation", drinks());

            const saved = (await app.objects(projectId, "conversation")).find((c) => c.id === "drinks");
            expect(saved?.nodes).toEqual(drinks().nodes);
            const dance = { id: "l1", type: "dance", next: null } as unknown as DialogueNode;
            const invalid: Conversation = { ...drinks(), nodes: [dance] };
            expect(await game.saveRefusal(projectId, "conversation", invalid)).toBe(await appRefusal(projectId, "conversation", invalid));
        });
    });
});
