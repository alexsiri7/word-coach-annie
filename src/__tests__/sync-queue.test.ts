import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock idb module before importing sync-queue
vi.mock("@/lib/offline/idb", () => {
  const ops: Array<{ id: number; url: string; method: string; body: string | null; timestamp: number; status: string; retries: number }> = [];
  let nextId = 1;

  return {
    queuePendingOp: vi.fn(async (op: Record<string, unknown>) => {
      const id = nextId++;
      ops.push({ ...op, id } as typeof ops[number]);
      return id;
    }),
    getPendingOps: vi.fn(async () => [...ops].sort((a, b) => a.timestamp - b.timestamp)),
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

import { offlineFetch, replayPendingOps, addSyncListener, type SyncEvent } from "@/lib/offline/sync-queue";
import { queuePendingOp } from "@/lib/offline/idb";

// Access internals for test management
const idbMock = await vi.importMock<{ _ops: Array<Record<string, unknown>>; _reset: () => void }>("@/lib/offline/idb");

describe("sync-queue", () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
    idbMock._reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "onLine", { value: originalOnLine, writable: true });
  });

  describe("offlineFetch", () => {
    it("passes through to fetch when online", async () => {
      Object.defineProperty(navigator, "onLine", { value: true, writable: true });

      const mockResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

      const res = await offlineFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({ title: "Test" }),
      });

      expect(res.status).toBe(200);
      expect(fetch).toHaveBeenCalledWith("/api/projects", expect.objectContaining({ method: "POST" }));
    });

    it("queues mutations when offline and returns 202", async () => {
      Object.defineProperty(navigator, "onLine", { value: false, writable: true });

      const res = await offlineFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({ title: "Test" }),
      });

      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.queued).toBe(true);
      expect(queuePendingOp).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "/api/projects",
          method: "POST",
          status: "pending",
        })
      );
    });

    it("does not queue GET requests when offline", async () => {
      Object.defineProperty(navigator, "onLine", { value: false, writable: true });

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

      await expect(offlineFetch("/api/projects")).rejects.toThrow("Network error");
      expect(queuePendingOp).not.toHaveBeenCalled();
    });

    it("does not queue non-API requests when offline", async () => {
      Object.defineProperty(navigator, "onLine", { value: false, writable: true });

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

      await expect(
        offlineFetch("https://external.com/endpoint", { method: "POST" })
      ).rejects.toThrow("Network error");
      expect(queuePendingOp).not.toHaveBeenCalled();
    });
  });

  describe("replayPendingOps", () => {
    it("replays queued ops in order on reconnect", async () => {
      Object.defineProperty(navigator, "onLine", { value: true, writable: true });

      // Pre-populate ops
      idbMock._ops.push(
        { id: 1, url: "/api/projects", method: "POST", body: '{"title":"A"}', timestamp: 100, status: "pending", retries: 0 },
        { id: 2, url: "/api/nodes/x", method: "PATCH", body: '{"title":"B"}', timestamp: 200, status: "pending", retries: 0 }
      );

      const fetchCalls: string[] = [];
      vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
        fetchCalls.push(url);
        return new Response("{}", { status: 200 });
      }));

      const events: SyncEvent[] = [];
      const unsub = addSyncListener((e) => events.push(e));

      await replayPendingOps();
      unsub();

      expect(fetchCalls).toEqual(["/api/projects", "/api/nodes/x"]);

      const doneEvent = events.find((e) => e.type === "replay-done");
      expect(doneEvent).toBeDefined();
      if (doneEvent && doneEvent.type === "replay-done") {
        expect(doneEvent.succeeded).toBe(2);
        expect(doneEvent.failed).toBe(0);
        expect(doneEvent.conflicts).toBe(0);
      }
    });

    it("handles 409 conflicts by discarding the op", async () => {
      Object.defineProperty(navigator, "onLine", { value: true, writable: true });

      idbMock._ops.push(
        { id: 1, url: "/api/nodes/x", method: "PATCH", body: '{}', timestamp: 100, status: "pending", retries: 0 }
      );

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 409 })));

      const events: SyncEvent[] = [];
      const unsub = addSyncListener((e) => events.push(e));

      await replayPendingOps();
      unsub();

      const conflictEvent = events.find((e) => e.type === "replay-conflict");
      expect(conflictEvent).toBeDefined();

      const doneEvent = events.find((e) => e.type === "replay-done");
      if (doneEvent && doneEvent.type === "replay-done") {
        expect(doneEvent.conflicts).toBe(1);
        expect(doneEvent.succeeded).toBe(0);
      }
    });

    it("handles server errors with retry tracking", async () => {
      Object.defineProperty(navigator, "onLine", { value: true, writable: true });

      idbMock._ops.push(
        { id: 1, url: "/api/nodes/x", method: "POST", body: '{}', timestamp: 100, status: "pending", retries: 0 }
      );

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));

      const events: SyncEvent[] = [];
      const unsub = addSyncListener((e) => events.push(e));

      await replayPendingOps();
      unsub();

      const errorEvent = events.find((e) => e.type === "replay-error");
      expect(errorEvent).toBeDefined();

      // Op should still be in the queue with incremented retries
      const op = idbMock._ops.find((o) => o.id === 1);
      expect(op?.retries).toBe(1);
      expect(op?.status).toBe("failed");
    });

    it("skips ops that have exceeded max retries", async () => {
      Object.defineProperty(navigator, "onLine", { value: true, writable: true });

      idbMock._ops.push(
        { id: 1, url: "/api/nodes/x", method: "POST", body: '{}', timestamp: 100, status: "failed", retries: 3 }
      );

      vi.stubGlobal("fetch", vi.fn());

      await replayPendingOps();

      // fetch should NOT have been called
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
