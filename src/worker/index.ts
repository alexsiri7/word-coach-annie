/// <reference lib="webworker" />

import { openDB } from "idb";

declare const self: ServiceWorkerGlobalScope;

const DB_NAME = "annie-offline";
const DB_VERSION = 1;

interface WorkerPendingOp {
  id: number;
  url: string;
  method: string;
  body: string | null;
  timestamp: number;
  status: "pending" | "in-flight" | "failed" | "conflict";
  retries: number;
  serverContent?: string | null;
}

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("pendingOps")) {
        db.createObjectStore("pendingOps", { keyPath: "id", autoIncrement: true });
      }
    },
  });
}

const MAX_SW_RETRIES = 3; // mirrors sync-queue.ts MAX_RETRIES

async function replayFromSW(): Promise<void> {
  const db = await getDB();
  const allOps: WorkerPendingOp[] = await db.getAll("pendingOps");

  const pending = allOps
    .filter(
      (op) =>
        (op.status === "pending" || op.status === "in-flight") &&
        (op.retries ?? 0) < MAX_SW_RETRIES
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const op of pending) {
    // Mark in-flight
    const txUpdate = db.transaction("pendingOps", "readwrite");
    const existing: WorkerPendingOp | undefined = await txUpdate.store.get(op.id);
    if (existing) {
      existing.status = "in-flight";
      await txUpdate.store.put(existing);
    }
    await txUpdate.done;

    try {
      const res = await fetch(op.url, {
        method: op.method,
        headers: { "Content-Type": "application/json" },
        body: op.body,
      });

      const txDone = db.transaction("pendingOps", "readwrite");
      const rec: WorkerPendingOp | undefined = await txDone.store.get(op.id);
      if (!rec) {
        await txDone.done;
        continue;
      }

      if (res.ok) {
        await txDone.store.delete(op.id);
      } else if (res.status === 409) {
        let serverContent: string | null = null;
        try {
          const d = await res.json();
          serverContent = typeof d.content === "string" ? d.content : JSON.stringify(d);
        } catch {
          /* ignore */
        }
        rec.status = "conflict";
        rec.serverContent = serverContent;
        await txDone.store.put(rec);
      } else {
        rec.status = "failed";
        rec.retries = (rec.retries ?? 0) + 1;
        await txDone.store.put(rec);
      }
      await txDone.done;
    } catch (err) {
      // Network error — leave as pending for next attempt
      console.warn("[sw-sync] network error replaying op", op.id, err);
      const txErr = db.transaction("pendingOps", "readwrite");
      const rec2: WorkerPendingOp | undefined = await txErr.store.get(op.id);
      if (rec2) {
        rec2.status = "pending";
        rec2.retries = (rec2.retries ?? 0) + 1;
        await txErr.store.put(rec2);
      }
      await txErr.done;
    }
  }
}

// @ts-expect-error SyncEvent type not in default lib
self.addEventListener("sync", (event: SyncEvent) => {
  if (event.tag === "annie-write-queue") {
    event.waitUntil(replayFromSW());
  }
});
