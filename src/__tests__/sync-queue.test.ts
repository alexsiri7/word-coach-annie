import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Stub navigator for Node.js test environment
const navigatorStub = { onLine: true };
vi.stubGlobal("navigator", navigatorStub);

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
    getConflictOps: vi.fn(async () => ops.filter((o) => o.status === "conflict")),
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
  beforeEach(() => {
    navigatorStub.onLine = true;
    idbMock._reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    navigatorStub.onLine = true;
  });

  describe("offlineFetch", () => {
    it("passes through to fetch when online", async () => {
      navigatorStub.onLine = true;

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
      navigatorStub.onLine = false;

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
      navigatorStub.onLine = false;

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

      await expect(offlineFetch("/api/projects")).rejects.toThrow("Network error");
      expect(queuePendingOp).not.toHaveBeenCalled();
    });

    it("does not queue non-API requests when offline", async () => {
      navigatorStub.onLine = false;

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

      await expect(
        offlineFetch("https://external.com/endpoint", { method: "POST" })
      ).rejects.toThrow("Network error");
      expect(queuePendingOp).not.toHaveBeenCalled();
    });
  });

  describe("replayPendingOps", () => {
    it("replays queued ops in order on reconnect", async () => {
      navigatorStub.onLine = true;

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
      expect(doneEvent).toMatchObject({ type: "replay-done", succeeded: 2, failed: 0, conflicts: 0 });
    });

    it("handles 409 conflicts by marking op as conflict with server content", async () => {
      navigatorStub.onLine = true;

      idbMock._ops.push(
        { id: 1, url: "/api/nodes/x", method: "PATCH", body: '{}', timestamp: 100, status: "pending", retries: 0 }
      );

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ content: "server version" }), { status: 409 })
      ));

      const events: SyncEvent[] = [];
      const unsub = addSyncListener((e) => events.push(e));

      await replayPendingOps();
      unsub();

      const conflictEvent = events.find((e) => e.type === "replay-conflict");
      expect(conflictEvent).toMatchObject({ type: "replay-conflict" });

      // Op must remain in IDB, marked as conflict (NOT removed)
      const op = idbMock._ops.find((o) => o.id === 1);
      expect(op).toBeDefined();
      expect(op?.status).toBe("conflict");
      expect(op?.serverContent).toBe("server version");

      const doneEvent = events.find((e) => e.type === "replay-done");
      expect(doneEvent).toMatchObject({ type: "replay-done", conflicts: 1, succeeded: 0 });
    });

    it("skips conflict ops during replay", async () => {
      navigatorStub.onLine = true;

      idbMock._ops.push(
        { id: 1, url: "/api/nodes/x", method: "PATCH", body: '{}', timestamp: 100, status: "conflict", retries: 0 },
        { id: 2, url: "/api/nodes/y", method: "PATCH", body: '{}', timestamp: 200, status: "pending", retries: 0 }
      );

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));

      await replayPendingOps();

      // Only the pending op should have been replayed
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith("/api/nodes/y", expect.anything());
    });

    it("handles server errors with retry tracking", async () => {
      navigatorStub.onLine = true;

      idbMock._ops.push(
        { id: 1, url: "/api/nodes/x", method: "POST", body: '{}', timestamp: 100, status: "pending", retries: 0 }
      );

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));

      const events: SyncEvent[] = [];
      const unsub = addSyncListener((e) => events.push(e));

      await replayPendingOps();
      unsub();

      const errorEvent = events.find((e) => e.type === "replay-error");
      expect(errorEvent).toMatchObject({ type: "replay-error" });

      const op = idbMock._ops.find((o) => o.id === 1);
      expect(op?.retries).toBe(1);
      expect(op?.status).toBe("failed");
    });

    it("skips ops that have exceeded max retries", async () => {
      navigatorStub.onLine = true;

      idbMock._ops.push(
        { id: 1, url: "/api/nodes/x", method: "POST", body: '{}', timestamp: 100, status: "failed", retries: 3 }
      );

      vi.stubGlobal("fetch", vi.fn());

      await replayPendingOps();

      expect(fetch).not.toHaveBeenCalled();
    });

    it("skips conflict ops without retrying them", async () => {
      navigatorStub.onLine = true;

      idbMock._ops.push(
        { id: 1, url: "/api/nodes/x", method: "POST", body: '{}', timestamp: 100, status: "conflict", retries: 0 }
      );

      vi.stubGlobal("fetch", vi.fn());

      await replayPendingOps();

      // Conflict op must NOT be retried
      expect(fetch).not.toHaveBeenCalled();
    });

    it("second concurrent call to replayPendingOps is a no-op", async () => {
      navigatorStub.onLine = true;

      idbMock._ops.push(
        { id: 1, url: "/api/nodes/x", method: "POST", body: '{}', timestamp: 100, status: "pending", retries: 0 }
      );

      let fetchCount = 0;
      vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
        fetchCount++;
        await new Promise((r) => setTimeout(r, 10));
        return new Response("{}", { status: 200 });
      }));

      // Fire two concurrent replays — second should be a no-op
      await Promise.all([replayPendingOps(), replayPendingOps()]);

      expect(fetchCount).toBe(1);
    });
  });

  describe("offlineFetch Background Sync registration", () => {
    it("registers the 'annie-write-queue' sync tag when offline", async () => {
      navigatorStub.onLine = false;
      const syncRegister = vi.fn().mockResolvedValue(undefined);
      (navigatorStub as any).serviceWorker = {
        ready: Promise.resolve({ sync: { register: syncRegister } }),
      };

      await offlineFetch("/api/nodes/x", { method: "POST", body: "{}" });

      // Allow microtasks to flush
      await new Promise((r) => setTimeout(r, 0));
      expect(syncRegister).toHaveBeenCalledWith("annie-write-queue");
    });

    it("does not throw when Background Sync is unavailable", async () => {
      navigatorStub.onLine = false;
      (navigatorStub as any).serviceWorker = {
        ready: Promise.resolve({}), // no .sync property
      };
      await expect(
        offlineFetch("/api/nodes/x", { method: "POST", body: "{}" })
      ).resolves.not.toThrow();
    });
  });
});
