/// <reference lib="webworker" />

import { openDB } from "idb";

declare const self: ServiceWorkerGlobalScope;

const DB_NAME = "annie-offline";
const DB_VERSION = 1;

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
  let db;
  try {
    db = await getDB();
  } catch (err) {
    console.error("[sw-sync] Failed to open IndexedDB", err);
    return;
  }
  const tx = db.transaction("pendingOps", "readonly");
  const allOps = await tx.store.getAll();
  await tx.done;

  const pending = allOps
    .filter(
      (op: Record<string, unknown>) =>
        (op.status === "pending" || op.status === "in-flight") &&
        ((op.retries as number) || 0) < MAX_SW_RETRIES
    )
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (a.timestamp as number) - (b.timestamp as number));

  for (const op of pending) {
    // Mark in-flight
    const txUpdate = db.transaction("pendingOps", "readwrite");
    const existing = await txUpdate.store.get(op.id as number);
    if (existing) {
      existing.status = "in-flight";
      await txUpdate.store.put(existing);
    }
    await txUpdate.done;

    try {
      const res = await fetch(op.url as string, {
        method: op.method as string,
        headers: { "Content-Type": "application/json" },
        body: op.body as string | null,
      });

      const txDone = db.transaction("pendingOps", "readwrite");
      const rec = await txDone.store.get(op.id as number);
      if (!rec) {
        await txDone.done;
        continue;
      }

      if (res.ok) {
        await txDone.store.delete(op.id as number);
      } else if (res.status === 409) {
        let serverContent: string | null = null;
        try {
          const d = await res.json();
          serverContent = typeof d.content === "string" ? d.content : JSON.stringify(d);
        } catch (err) {
          console.warn("[sw-sync] 409 body not JSON", err);
        }
        rec.status = "conflict";
        rec.serverContent = serverContent;
        await txDone.store.put(rec);
      } else {
        rec.status = "pending";
        rec.retries = ((rec.retries as number) || 0) + 1;
        await txDone.store.put(rec);
      }
      await txDone.done;
    } catch (err) {
      // Network error — leave as pending for next attempt
      console.warn("[sw-sync] network error replaying op", op.id, err);
      const txErr = db.transaction("pendingOps", "readwrite");
      const rec2 = await txErr.store.get(op.id as number);
      if (rec2) {
        rec2.status = "pending";
        rec2.retries = ((rec2.retries as number) || 0) + 1;
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
