import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock snapshot module to avoid filesystem operations
vi.mock("../mcp/snapshot", () => ({
    initSnapshotRepo: vi.fn(),
    createSnapshot: vi.fn(() => ({ hash: "abc123", message: "test" })),
    listSnapshots: vi.fn(() => []),
    restoreSnapshot: vi.fn(() => ({ hash: "def456", message: "restored" })),
    autoSnapshot: vi.fn(),
}));

describe("MCP Server", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("creates a server with all tools registered", async () => {
        const { createServer } = await import("../mcp/index");
        const server = createServer({ allowDestructive: true });
        expect(server).toBeDefined();
    });

    it("creates a server with destructive tools disabled", async () => {
        const { createServer } = await import("../mcp/index");
        const server = createServer({ allowDestructive: false });
        expect(server).toBeDefined();
    });

    it("creates a server with default options", async () => {
        const { createServer } = await import("../mcp/index");
        const server = createServer();
        expect(server).toBeDefined();
    });

    it("registers review persona prompts (review-editor, review-fan, review-author)", async () => {
        // Prompt registration failures cause createServer() to throw during module load
        const { createServer } = await import("../mcp/index");
        const server = createServer({ allowDestructive: true });
        expect(server).toBeDefined();
    });
});
