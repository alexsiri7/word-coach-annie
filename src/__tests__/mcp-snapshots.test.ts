import { describe, it, expect, vi } from "vitest";
import { snapshotDatabase, listDatabaseSnapshots, restoreDatabaseSnapshot } from "@/mcp/tools/snapshots";

// Mock the snapshot module since it calls git commands
vi.mock("@/mcp/snapshot", () => ({
    createSnapshot: vi.fn((message: string) => ({ hash: "abc1234", message })),
    listSnapshots: vi.fn((limit: number) => [
        { hash: "abc1234", date: "2025-01-01T00:00:00Z", message: "test snapshot" },
        { hash: "def5678", date: "2025-01-01T00:00:01Z", message: "another snapshot" }
    ].slice(0, limit)),
    restoreSnapshot: vi.fn((hash: string) => ({ hash: "new1234", message: `restore: reverted to snapshot ${hash}` })),
    autoSnapshot: vi.fn(),
}));

describe("MCP Snapshots Tools", () => {
    describe("snapshotDatabase", () => {
        it("creates a snapshot with message", async () => {
            const result = await snapshotDatabase("Test snapshot");
            expect(result.success).toBe(true);
            expect(result.hash).toBe("abc1234");
            expect(result.message).toBe("Test snapshot");
        });

        it("throws for empty message", async () => {
            await expect(snapshotDatabase("")).rejects.toThrow("description message is required");
        });

        it("throws for whitespace-only message", async () => {
            await expect(snapshotDatabase("   ")).rejects.toThrow("description message is required");
        });
    });

    describe("listDatabaseSnapshots", () => {
        it("lists snapshots with default limit", async () => {
            const result = await listDatabaseSnapshots();
            expect(result.snapshots).toBeInstanceOf(Array);
            expect(result.total).toBeGreaterThan(0);
        });

        it("lists snapshots with custom limit", async () => {
            const result = await listDatabaseSnapshots(1);
            expect(result.snapshots).toHaveLength(1);
        });
    });

    describe("restoreDatabaseSnapshot", () => {
        it("restores a snapshot", async () => {
            const result = await restoreDatabaseSnapshot("abc1234");
            expect(result.success).toBe(true);
            expect(result.warning).toContain("Prisma client");
        });

        it("throws for empty commitHash", async () => {
            await expect(restoreDatabaseSnapshot("")).rejects.toThrow("commitHash is required");
        });

        it("throws for whitespace-only commitHash", async () => {
            await expect(restoreDatabaseSnapshot("   ")).rejects.toThrow("commitHash is required");
        });
    });
});
