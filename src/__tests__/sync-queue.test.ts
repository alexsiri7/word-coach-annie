import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Stub navigator for Node.js test environment
const navigatorStub: { onLine: boolean; locks?: { request: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } } = { onLine: true };
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

import {
  offlineFetch,
  replayPendingOps,
  retryFailedOp,
  forceReplayOp,
  isFinallyFailed,
  classifySyncOps,
  addSyncListener,
  type SyncEvent,
} from "@/lib/offline/sync-queue";
import type { PendingOp } from "@/lib/offline/idb";
import { queuePendingOp } from "@/lib/offline/idb";
import { computeContentHash } from "@/mcp/content-hash";

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
    delete navigatorStub.locks;
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

      const doneEvent = events.find((e) => e.type === "replay-done");
      expect(doneEvent).toMatchObject({ type: "replay-done", conflicts: 1, succeeded: 0 });

      // Op should be marked as conflict, not removed
      const op = idbMock._ops.find((o) => o.id === 1);
      expect(op?.status).toBe("conflict");
      expect(op?.serverContent).toBe("server version");
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

    it("refreshes the session on 401 and re-sends the op", async () => {
      idbMock._ops.push(
        { id: 1, url: "/api/nodes/x", method: "PATCH", body: '{}', timestamp: 100, status: "pending", retries: 0 }
      );

      let opCalls = 0;
      vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
        if (url === "/api/auth/refresh") return new Response("{}", { status: 200 });
        opCalls++;
        return new Response("{}", { status: opCalls === 1 ? 401 : 200 });
      }));

      const events: SyncEvent[] = [];
      const unsub = addSyncListener((e) => events.push(e));

      await replayPendingOps();
      unsub();

      expect(idbMock._ops).toHaveLength(0);
      expect(events.find((e) => e.type === "replay-done")).toMatchObject({ succeeded: 1, failed: 0 });
    });

    it("marks ops failed and refreshes only once when the session can't be renewed", async () => {
      idbMock._ops.push(
        { id: 1, url: "/api/nodes/x", method: "PATCH", body: '{}', timestamp: 100, status: "pending", retries: 0 },
        { id: 2, url: "/api/nodes/y", method: "PATCH", body: '{}', timestamp: 200, status: "pending", retries: 0 }
      );

      const fetchMock = vi.fn().mockImplementation(async () => new Response("{}", { status: 401 }));
      vi.stubGlobal("fetch", fetchMock);

      await replayPendingOps();

      expect(idbMock._ops).toEqual([
        expect.objectContaining({ id: 1, status: "failed", retries: 1 }),
        expect.objectContaining({ id: 2, status: "failed", retries: 1 }),
      ]);
      expect(fetchMock.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
    });

    it("reads the queue only after acquiring the replay lock", async () => {
      idbMock._ops.push(
        { id: 1, url: "/api/nodes/x", method: "PATCH", body: '{}', timestamp: 100, status: "pending", retries: 0 }
      );
      // Another context replays the op while this one waits for the lock.
      navigatorStub.locks = {
        request: async (_name, fn) => {
          idbMock._ops.length = 0;
          return fn();
        },
      };
      vi.stubGlobal("fetch", vi.fn());

      await replayPendingOps();

      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("retryFailedOp", () => {
    const failedOp = () => ({ id: 1, url: "/api/nodes/x", method: "PATCH", body: '{}', timestamp: 100, status: "failed", retries: 3 });

    it("re-sends a finally-failed op and removes it on success", async () => {
      idbMock._ops.push(failedOp());
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));

      await expect(retryFailedOp(1)).resolves.toBe(true);

      expect(fetch).toHaveBeenCalledWith("/api/nodes/x", expect.anything());
      expect(idbMock._ops).toHaveLength(0);
    });

    it("reports failure and leaves the op finally failed when the re-send fails", async () => {
      idbMock._ops.push(failedOp());
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));

      await expect(retryFailedOp(1)).resolves.toBe(false);

      expect(idbMock._ops).toHaveLength(1);
      expect(isFinallyFailed(idbMock._ops[0] as unknown as PendingOp)).toBe(true);
    });

    it("runs under the replay lock", async () => {
      idbMock._ops.push(failedOp());
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
      const request = vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn());
      navigatorStub.locks = { request };

      await retryFailedOp(1);

      expect(request).toHaveBeenCalledWith("annie-replay", expect.any(Function));
    });
  });

  describe("forceReplayOp", () => {
    const conflictOp = () => ({
      id: 1,
      url: "/api/nodes/x/content",
      method: "POST",
      body: JSON.stringify({ content: "<p>mine</p>", contentHash: null }),
      timestamp: 100,
      status: "conflict",
      retries: 0,
      serverContent: "<p>theirs</p>",
    });
    const sentBody = () => JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);

    it("re-bases a conflicted content save onto the server version it conflicted with", async () => {
      idbMock._ops.push(conflictOp());
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 201 })));

      await expect(forceReplayOp(1)).resolves.toBe(true);

      expect(sentBody()).toEqual({ content: "<p>mine</p>", contentHash: computeContentHash("<p>theirs</p>") });
      expect(idbMock._ops).toHaveLength(0);
    });

    it("stores newer server content when the server has moved on again", async () => {
      idbMock._ops.push(conflictOp());
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ conflict: true, content: "<p>newer</p>" }), { status: 409 })
      ));

      await expect(forceReplayOp(1)).resolves.toBe(false);

      expect(idbMock._ops).toHaveLength(1);
      expect(idbMock._ops[0].serverContent).toBe("<p>newer</p>");
    });

    it("sends an op without a contentHash with its original body", async () => {
      const body = JSON.stringify({ status: "DRAFT" });
      idbMock._ops.push({ ...conflictOp(), method: "PATCH", body });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));

      await expect(forceReplayOp(1)).resolves.toBe(true);

      expect(vi.mocked(fetch).mock.calls[0][1]!.body).toBe(body);
    });
  });

  describe("classifySyncOps", () => {
    it("separates pending, conflict, and finally-failed ops", () => {
      const op = (id: number, status: PendingOp["status"], retries: number): PendingOp =>
        ({ id, url: "/api/x", method: "PATCH", body: null, timestamp: id, status, retries });
      const pending = op(1, "pending", 0);
      const retriable = op(2, "failed", 1);
      const conflict = op(3, "conflict", 3);
      const failed = op(4, "failed", 3);

      const result = classifySyncOps([pending, retriable, conflict, failed]);

      expect(result.pendingCount).toBe(2);
      expect(result.conflictOps).toEqual([conflict]);
      expect(result.failedOps).toEqual([failed]);
    });
  });

  describe("isFinallyFailed", () => {
    const base: PendingOp = { id: 1, url: "/api/x", method: "PATCH", body: null, timestamp: 0, status: "failed", retries: 3 };

    it("is true once retries are exhausted", () => {
      expect(isFinallyFailed(base)).toBe(true);
    });

    it("is false for conflicts", () => {
      expect(isFinallyFailed({ ...base, status: "conflict" })).toBe(false);
    });

    it("is false while retries remain", () => {
      expect(isFinallyFailed({ ...base, retries: 1 })).toBe(false);
    });
  });
});
