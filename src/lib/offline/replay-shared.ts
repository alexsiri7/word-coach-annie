// Shared by the page (sync-queue.ts) and the service worker (src/worker/index.ts).
// Keep this module import-free: the worker bundle is compiled separately.

export const MAX_REPLAY_RETRIES = 3;
export const REPLAY_LOCK_NAME = "annie-replay";

/** An op that replay no longer attempts; only the user can retry or discard it. */
export function isFinallyFailed(op: { status: string; retries?: number }): boolean {
  return op.status !== "conflict" && (op.retries ?? 0) >= MAX_REPLAY_RETRIES;
}

/**
 * Runs `fn` while holding an origin-wide Web Lock shared by every tab and the
 * service worker, so only one context replays the queue at a time. Callers
 * must read the op list inside `fn`: a context that waited then sees the
 * previous owner's results instead of re-sending the same ops.
 *
 * Without Web Locks support (Safari < 15.4) `fn` runs unguarded.
 */
export async function withReplayLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return fn();
  return locks.request(REPLAY_LOCK_NAME, () => fn());
}

/**
 * Returns a function that refreshes the session at most once per replay run.
 * /api/auth/refresh is rate-limited per IP and rotates the refresh token, so
 * refreshing once per failing op would trip the limit or revoke itself.
 */
export function createSessionRefresher(): () => Promise<boolean> {
  let pending: Promise<boolean> | null = null;
  return () => {
    pending ??= fetch("/api/auth/refresh", { method: "POST" }).then(
      (res) => res.ok,
      () => false
    );
    return pending;
  };
}

export interface ReplayableOp {
  url: string;
  method: string;
  body: string | null;
}

function sendOp(op: ReplayableOp): Promise<Response> {
  return fetch(op.url, {
    method: op.method,
    headers: { "Content-Type": "application/json" },
    body: op.body,
  });
}

/**
 * Sends a queued op. On 401 it refreshes the session and re-sends once; if the
 * refresh fails or the re-send is also 401, the 401 is returned for the
 * caller's normal failure handling. Network errors propagate.
 */
export async function replayFetch(
  op: ReplayableOp,
  refreshSession: () => Promise<boolean>
): Promise<Response> {
  const res = await sendOp(op);
  if (res.status !== 401) return res;
  if (!(await refreshSession())) return res;
  return sendOp(op);
}
