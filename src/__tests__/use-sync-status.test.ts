import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub navigator for Node.js test environment
const navigatorStub = { onLine: true };
vi.stubGlobal("navigator", navigatorStub);

// Mock idb module
vi.mock("@/lib/offline/idb", () => {
  const ops: Array<{
    id: number;
    url: string;
    method: string;
    body: string | null;
    timestamp: number;
    status: string;
    retries: number;
    serverContent?: string | null;
  }> = [];
  let nextId = 1;

  return {
    queuePendingOp: vi.fn(async (op: Record<string, unknown>) => {
      const id = nextId++;
      ops.push({ ...op, id } as typeof ops[number]);
      return id;
    }),
    getPendingOps: vi.fn(async () => [...ops].sort((a, b) => a.timestamp - b.timestamp)),
    getConflictOps: vi.fn(async () => ops.filter((o) => o.status === "conflict")),
    updatePendingOp: vi.fn(async (id: number, updates: Record<string, unknown>) => {
      const op = ops.find((o) => o.id === id);
      if (op) Object.assign(op, updates);
    }),
    removePendingOp: vi.fn(async (id: number) => {
      const idx = ops.findIndex((o) => o.id === id);
      if (idx >= 0) ops.splice(idx, 1);
    }),
    _ops: ops,
    _reset: () => {
      ops.length = 0;
      nextId = 1;
    },
  };
});

import { forceReplayOp } from "@/lib/offline/sync-queue";

const idbMock = await vi.importMock<{
  _ops: Array<Record<string, unknown>>;
  _reset: () => void;
  getConflictOps: () => Promise<Array<Record<string, unknown>>>;
}>("@/lib/offline/idb");

describe("conflict resolution", () => {
  beforeEach(() => {
    navigatorStub.onLine = true;
    idbMock._reset();
    vi.restoreAllMocks();
  });

  describe("getConflictOps", () => {
    it("returns only ops with status 'conflict'", async () => {
      idbMock._ops.push(
        { id: 1, url: "/api/a", method: "POST", body: null, timestamp: 1, status: "pending", retries: 0 },
        { id: 2, url: "/api/b", method: "POST", body: null, timestamp: 2, status: "conflict", retries: 0, serverContent: "server" },
        { id: 3, url: "/api/c", method: "POST", body: null, timestamp: 3, status: "failed", retries: 2 },
      );

      const conflicts = await idbMock.getConflictOps();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].id).toBe(2);
      expect(conflicts[0].status).toBe("conflict");
    });

    it("returns empty array when no conflicts exist", async () => {
      idbMock._ops.push(
        { id: 1, url: "/api/a", method: "POST", body: null, timestamp: 1, status: "pending", retries: 0 },
      );

      const conflicts = await idbMock.getConflictOps();
      expect(conflicts).toHaveLength(0);
    });
  });

  describe("forceReplayOp", () => {
    it("removes the op on successful replay", async () => {
      idbMock._ops.push(
        { id: 1, url: "/api/nodes/x/content", method: "PATCH", body: '{"content":"local"}', timestamp: 1, status: "conflict", retries: 0, serverContent: "server" },
      );

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));

      await forceReplayOp(1);

      expect(fetch).toHaveBeenCalledWith("/api/nodes/x/content", expect.objectContaining({ method: "PATCH" }));
      expect(idbMock._ops).toHaveLength(0);
    });

    it("keeps the op in queue on network error", async () => {
      idbMock._ops.push(
        { id: 1, url: "/api/nodes/x/content", method: "PATCH", body: '{"content":"local"}', timestamp: 1, status: "conflict", retries: 0 },
      );

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

      await forceReplayOp(1);

      expect(idbMock._ops).toHaveLength(1);
    });

    it("does nothing for non-existent op", async () => {
      vi.stubGlobal("fetch", vi.fn());

      await forceReplayOp(999);

      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
