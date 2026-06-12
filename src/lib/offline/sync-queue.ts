import {
  queuePendingOp,
  getPendingOps,
  updatePendingOp,
  removePendingOp,
  type PendingOp,
} from "./idb";

// ─── Types ─────────────────────────────────────────────────────────────────

type SyncReg = ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } };

export type SyncEvent =
  | { type: "replay-start"; total: number }
  | { type: "replay-op"; op: PendingOp; index: number; total: number }
  | { type: "replay-success"; op: PendingOp; index: number; total: number }
  | { type: "replay-conflict"; op: PendingOp; index: number; total: number }
  | { type: "replay-error"; op: PendingOp; index: number; total: number; error: string }
  | { type: "replay-done"; succeeded: number; failed: number; conflicts: number };

export type SyncListener = (event: SyncEvent) => void;

// ─── Constants ─────────────────────────────────────────────────────────────

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_RETRIES = 3;

// ─── Listener registry ────────────────────────────────────────────────────

const listeners = new Set<SyncListener>();

export function addSyncListener(fn: SyncListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(event: SyncEvent) {
  listeners.forEach((fn) => fn(event));
}

// ─── Offline-aware fetch ───────────────────────────────────────────────────

/**
 * Wraps the standard fetch API. When the browser is offline and the request
 * is a mutation (POST/PUT/PATCH/DELETE to /api/*), the call is queued in
 * IndexedDB instead of sent over the network.
 *
 * GET requests while offline will still throw (callers handle their own
 * loading/error states).
 */
export async function offlineFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  let url: string;
  if (typeof input === "string") {
    url = input;
  } else if (input instanceof URL) {
    url = input.toString();
  } else {
    url = input.url;
  }
  const method = (init?.method ?? "GET").toUpperCase();

  // Only intercept mutations to our own API when offline
  if (!navigator.onLine && MUTATION_METHODS.has(method) && url.startsWith("/api/")) {
    const body = init?.body != null ? String(init.body) : null;

    await queuePendingOp({
      url,
      method,
      body,
      timestamp: Date.now(),
      status: "pending",
      retries: 0,
    });

    // Register Background Sync so the SW can replay when the tab is closed
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "SyncManager" in window
    ) {
      navigator.serviceWorker.ready
        .then((reg) => (reg as SyncReg).sync.register("annie-write-queue"))
        .catch((err) => console.warn("[sync] Background Sync registration failed", err));
    }

    // Return a synthetic 202 Accepted so callers can treat it as "queued"
    return new Response(JSON.stringify({ queued: true }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  }

  return fetch(input, init);
}

// ─── Replay engine ─────────────────────────────────────────────────────────

let replaying = false;

/**
 * Replays all pending operations in order. Called when the browser comes
 * back online. Operations are replayed sequentially to preserve ordering.
 *
 * Conflict handling: if the server responds with 409, the op is marked as
 * `"conflict"` and the server's content is stored in `serverContent` for
 * manual resolution via ConflictResolverModal. Conflict ops are skipped on
 * subsequent replays until the user resolves them.
 */
export async function replayPendingOps(): Promise<void> {
  if (replaying) return;
  replaying = true;

  try {
    const ops = await getPendingOps();
    if (ops.length === 0) return;

    emit({ type: "replay-start", total: ops.length });

    let succeeded = 0;
    let failed = 0;
    let conflicts = 0;

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];

      // Skip conflict ops — they need manual resolution
      if (op.status === "conflict") continue;

      // Skip already-failed ops that exceeded retries
      if (op.retries >= MAX_RETRIES) {
        failed++;
        continue;
      }

      emit({ type: "replay-op", op, index: i, total: ops.length });

      await updatePendingOp(op.id!, { status: "in-flight" });

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        const res = await fetch(op.url, {
          method: op.method,
          headers,
          body: op.body,
        });

        if (res.ok) {
          await removePendingOp(op.id!);
          succeeded++;
          emit({ type: "replay-success", op, index: i, total: ops.length });
        } else if (res.status === 409) {
          // Conflict — store server version for manual resolution
          let serverContent: string | null = null;
          try {
            const data = await res.json();
            serverContent = typeof data.content === "string" ? data.content : JSON.stringify(data);
          } catch (err) {
            // response body not JSON
            console.warn("[sync] 409 body not JSON", err);
          }
          await updatePendingOp(op.id!, { status: "conflict", serverContent });
          conflicts++;
          emit({ type: "replay-conflict", op, index: i, total: ops.length });
        } else {
          // Server error — mark failed, increment retries
          await updatePendingOp(op.id!, {
            status: "failed",
            retries: (op.retries || 0) + 1,
          });
          failed++;
          emit({
            type: "replay-error",
            op,
            index: i,
            total: ops.length,
            error: `HTTP ${res.status}`,
          });
        }
      } catch (err) {
        // Network error during replay — stop replaying, we're probably offline again
        await updatePendingOp(op.id!, {
          status: "pending",
          retries: (op.retries || 0) + 1,
        });
        failed++;
        emit({
          type: "replay-error",
          op,
          index: i,
          total: ops.length,
          error: err instanceof Error ? err.message : "Network error",
        });

        // If we lost connectivity mid-replay, bail out
        if (!navigator.onLine) break;
      }
    }

    emit({ type: "replay-done", succeeded, failed, conflicts });
  } finally {
    replaying = false;
  }
}

/**
 * Force-replay a single conflict op (used by "Keep my version" resolution).
 * Returns true if the op was successfully replayed and removed; false if it
 * failed (network error or non-2xx response) and stays in the queue.
 */
export async function forceReplayOp(id: number): Promise<boolean> {
  const ops = await getPendingOps();
  const op = ops.find((o) => o.id === id);
  if (!op) return false;
  try {
    const res = await fetch(op.url, {
      method: op.method,
      headers: { "Content-Type": "application/json" },
      body: op.body,
    });
    if (res.ok) {
      await removePendingOp(id);
      return true;
    }
    console.warn(`[sync] forceReplayOp HTTP ${res.status} for op ${id}`);
    return false;
  } catch (err) {
    // network error — leave in queue for retry
    console.warn("[sync] forceReplayOp network error", err);
    return false;
  }
}
