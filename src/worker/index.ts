/// <reference lib="webworker" />

import { openDB } from "idb";

declare const self: ServiceWorkerGlobalScope;

const DB_NAME = "annie-offline";
const DB_VERSION = 1;

async function getDB() {
  return openDB(DB_NAME, DB_VERSION);
}

async function replayFromSW(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("pendingOps", "readonly");
  const allOps = await tx.store.getAll();
  await tx.done;

  const pending = allOps
    .filter((op: Record<string, unknown>) => op.status === "pending" || op.status === "in-flight")
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

      if (res.ok || res.status === 201) {
        await txDone.store.delete(op.id as number);
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
        rec.retries = ((rec.retries as number) || 0) + 1;
        await txDone.store.put(rec);
      }
      await txDone.done;
    } catch {
      // Network error — leave as pending for next attempt
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
