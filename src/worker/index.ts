// Custom service worker extension loaded by @ducanh2912/next-pwa via customWorkerSrc.
// Handles the Background Sync 'annie-write-queue' tag: replays pending ops from
// IndexedDB when the browser signals connectivity is restored, even if no tab is open.

import { openDB } from "idb";

const DB_NAME = "annie-offline";
const DB_VERSION = 1;
const SYNC_TAG = "annie-write-queue";

async function replaySWPendingOps(): Promise<void> {
  const db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("pendingOps")) {
        db.createObjectStore("pendingOps", { keyPath: "id", autoIncrement: true });
      }
    },
  });
  const ops = await db.getAll("pendingOps");
  ops.sort((a: { timestamp: number }, b: { timestamp: number }) => a.timestamp - b.timestamp);

  for (const op of ops) {
    if (op.retries >= 3 || op.status === "conflict") continue;
    try {
      const res = await fetch(op.url, {
        method: op.method,
        headers: { "Content-Type": "application/json" },
        body: op.body,
      });
      if (res.ok) {
        await db.delete("pendingOps", op.id);
      } else if (res.status === 409) {
        await db.put("pendingOps", { ...op, status: "conflict" });
      } else {
        await db.put("pendingOps", { ...op, status: "failed", retries: (op.retries || 0) + 1 });
      }
    } catch (err) {
      console.error("[SW] replaySWPendingOps: fetch failed for op", op.id, op.url, err);
      await db.put("pendingOps", { ...op, status: "pending", retries: (op.retries || 0) + 1 });
    }
  }
}

// Background Sync types are not in the default TS DOM lib.
// Use a loose typed event listener to avoid needing webworker lib.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(self as any).addEventListener("sync", (event: any) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replaySWPendingOps());
  }
});
