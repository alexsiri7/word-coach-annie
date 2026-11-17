import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
    project: { findFirst: vi.fn(), findUnique: vi.fn() },
    universe: { findFirst: vi.fn() },
    structureNode: { findUnique: vi.fn() },
    writingTask: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { assertCanAccess, assertOwnerRole, type ChatPrincipal } from "@/lib/access/resource-access";

// Fixtures: user "alice" owns project P (linked to universe U) and universe V; nodes n-P / n-Q live in P / Q.
beforeEach(() => {
    db.project.findFirst.mockImplementation(async ({ where }) =>
        where.id === "P" && where.userId === "alice" ? { id: "P" } : null);
    db.project.findUnique.mockImplementation(async ({ where }) => (where.id === "P" ? { universeId: "U" } : null));
    db.universe.findFirst.mockImplementation(async ({ where }) =>
        ["U", "V"].includes(where.id) && where.userId === "alice" ? { id: where.id } : null);
    db.structureNode.findUnique.mockImplementation(async ({ where }) =>
        ({ "n-P": { projectId: "P" }, "n-Q": { projectId: "Q" } } as Record<string, { projectId: string }>)[where.id] ?? null);
});

const chat = (over: Partial<ChatPrincipal> = {}): ChatPrincipal =>
    ({ userId: "alice", pinnedProjectId: "P", role: "OWNER", ...over });

describe("assertCanAccess — MCP owner principal", () => {
    it("allows the owner", async () => {
        await expect(assertCanAccess({ userId: "alice" }, [
            { kind: "project", id: "P" }, { kind: "node", id: "n-P" }, { kind: "universe", id: "V" },
        ])).resolves.toBeUndefined();
    });

    it("rejects a non-owner", async () => {
        await expect(assertCanAccess({ userId: "bob" }, [{ kind: "node", id: "n-P" }]))
            .rejects.toThrow("Project not found or access denied");
        await expect(assertCanAccess({ userId: "bob" }, [{ kind: "universe", id: "U" }]))
            .rejects.toThrow("Universe not found or access denied");
    });

    it("allows everything in single-user mode without an ownership query, but still rejects a missing node", async () => {
        await expect(assertCanAccess({ userId: null }, [{ kind: "project", id: "Q" }, { kind: "node", id: "n-Q" }]))
            .resolves.toBeUndefined();
        expect(db.project.findFirst).not.toHaveBeenCalled();
        await expect(assertCanAccess({ userId: null }, [{ kind: "node", id: "missing" }]))
            .rejects.toThrow("Node not found or access denied");
    });

    it("checks refs in order, so the first bad ref decides the error", async () => {
        await expect(assertCanAccess({ userId: "bob" }, [{ kind: "node", id: "missing" }, { kind: "project", id: "P" }]))
            .rejects.toThrow("Node not found");
    });

    it("resolves every id of a batch before checking any owner", async () => {
        await expect(assertCanAccess({ userId: "alice" }, [{ kind: "node", ids: ["n-P", "n-Q", "n-P"] }]))
            .rejects.toThrow("Project not found or access denied");
        expect(db.structureNode.findUnique).toHaveBeenCalledTimes(3);
        expect(db.project.findFirst).toHaveBeenCalledTimes(2); // distinct projects only
    });

    it("lets a user reach their own project-less writing task only", async () => {
        db.writingTask.findUnique.mockResolvedValue({ projectId: null, userId: "alice" });
        await expect(assertCanAccess({ userId: "alice" }, [{ kind: "writingTask", id: "t" }])).resolves.toBeUndefined();
        await expect(assertCanAccess({ userId: null }, [{ kind: "writingTask", id: "t" }])).resolves.toBeUndefined();
        await expect(assertCanAccess({ userId: "bob" }, [{ kind: "writingTask", id: "t" }]))
            .rejects.toThrow("Writing task not found or access denied");
    });
});

describe("assertCanAccess — chat principal pinned to a project", () => {
    it("allows resources in the pinned project and refuses others without an owner query", async () => {
        await expect(assertCanAccess(chat(), [{ kind: "project", id: "P" }, { kind: "node", id: "n-P" }])).resolves.toBeUndefined();
        await expect(assertCanAccess(chat(), [{ kind: "node", id: "n-Q" }]))
            .rejects.toThrow("Forbidden: project is outside the current project");
        await expect(assertCanAccess(chat({ userId: null }), [{ kind: "project", id: "Q" }])).rejects.toThrow(/Forbidden/);
        expect(db.project.findFirst).not.toHaveBeenCalled();
    });

    it("allows the project's linked universe without an owner check, and falls back to ownership otherwise", async () => {
        await expect(assertCanAccess(chat({ userId: "bob" }), [{ kind: "universe", id: "U" }])).resolves.toBeUndefined();
        expect(db.universe.findFirst).not.toHaveBeenCalled();
        await expect(assertCanAccess(chat(), [{ kind: "universe", id: "V" }])).resolves.toBeUndefined();
        await expect(assertCanAccess(chat({ userId: "bob" }), [{ kind: "universe", id: "V" }]))
            .rejects.toThrow("Universe not found or access denied");
    });

    it("does not count the linked universe for an ownedUniverse ref", async () => {
        await expect(assertCanAccess(chat({ userId: "bob" }), [{ kind: "ownedUniverse", id: "U" }]))
            .rejects.toThrow("Universe not found or access denied");
    });
});

describe("assertOwnerRole", () => {
    it("refuses an editor and allows an owner or single-user mode", () => {
        expect(() => assertOwnerRole(chat({ role: "EDITOR" }))).toThrow("Forbidden: only the project owner may do this");
        expect(() => assertOwnerRole(chat())).not.toThrow();
        expect(() => assertOwnerRole(chat({ userId: null, role: null }))).not.toThrow();
    });

    it("is a no-op for an MCP principal", () => {
        expect(() => assertOwnerRole({ userId: "bob" })).not.toThrow();
    });
});
