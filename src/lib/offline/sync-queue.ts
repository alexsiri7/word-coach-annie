import {
  queuePendingOp,
  getPendingOps,
  updatePendingOp,
  removePendingOp,
  type PendingOp,
} from "./idb";

// ─── Types ─────────────────────────────────────────────────────────────────

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
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
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
 * a conflict and removed from the queue (the server version wins).
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

        if (res.ok || res.status === 201) {
          await removePendingOp(op.id!);
          succeeded++;
          emit({ type: "replay-success", op, index: i, total: ops.length });
        } else if (res.status === 409) {
          // Conflict — server version is newer; discard the queued op
          await removePendingOp(op.id!);
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
