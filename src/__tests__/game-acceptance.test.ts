// The acceptance harness's refusal guard, proved both ways: a validation refusal returns its
// reason, while a missing tool or a crash throws, so an `it.fails` refusal test cannot pass
// on either.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api-auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-auth")>();
    return { ...actual, getCurrentUserId: vi.fn(() => null as string | null) };
});
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { prisma } from "@/lib/db";
import { connectGame } from "./game-acceptance";

const update = { projectId: "no-such-project", contentHash: "0".repeat(64), title: "T" };

describe("the acceptance harness's refusal guard", () => {
    it("returns the reason of a validation refusal", async () => {
        const game = await connectGame();
        expect(await game.refusal("update_project", update)).toBe("Project not found or access denied");
    });

    it("throws for a tool that does not exist", async () => {
        const game = await connectGame();
        await expect(game.refusal("no_such_tool", {})).rejects.toThrow(/did not refuse/);
    });

    it("throws for a crash, which the tool reports as an unexpected error", async () => {
        const game = await connectGame();
        vi.spyOn(prisma.project, "findFirst").mockRejectedValueOnce(new Error("connection reset"));
        await expect(game.refusal("update_project", update)).rejects.toThrow(/did not refuse/);
    });

    it("throws when the call succeeds", async () => {
        const game = await connectGame();
        await expect(game.refusal("list_projects", {})).rejects.toThrow(/expected to refuse/);
    });
});
