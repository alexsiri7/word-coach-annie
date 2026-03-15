"use client";

import { useCallback } from "react";
import { useSyncQueue } from "@/lib/offline/use-sync-queue";
import { useToast } from "@/components/ui/toast";
import type { SyncEvent } from "@/lib/offline/sync-queue";

export function SyncToast() {
  const { toast } = useToast();

  const handleSync = useCallback(
    (event: SyncEvent) => {
      switch (event.type) {
        case "replay-start":
          toast(
            `Syncing ${event.total} queued change${event.total > 1 ? "s" : ""}...`,
            "info",
            0
          );
          break;
        case "replay-success":
          toast(
            `Synced: ${methodLabel(event.op.method)} ${shortUrl(event.op.url)}`,
            "success"
          );
          break;
        case "replay-conflict":
          toast(
            `Conflict: ${shortUrl(event.op.url)} — server version kept`,
            "warning"
          );
          break;
        case "replay-error":
          toast(
            `Failed: ${shortUrl(event.op.url)} — ${event.error}`,
            "error"
          );
          break;
        case "replay-done": {
          const parts: string[] = [];
          if (event.succeeded) parts.push(`${event.succeeded} synced`);
          if (event.conflicts)
            parts.push(
              `${event.conflicts} conflict${event.conflicts > 1 ? "s" : ""}`
            );
          if (event.failed) parts.push(`${event.failed} failed`);
          toast(
            `Sync complete: ${parts.join(", ")}`,
            event.failed > 0 ? "warning" : "success"
          );
          break;
        }
      }
    },
    [toast]
  );

  useSyncQueue(handleSync);

  return null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function methodLabel(method: string): string {
  const labels: Record<string, string> = {
    POST: "Created",
    PUT: "Updated",
    PATCH: "Updated",
    DELETE: "Deleted",
  };
  return labels[method] || method;
}

function shortUrl(url: string): string {
  return url
    .replace("/api/", "")
    .replace(/\/[a-z0-9-]{8,}/gi, "/...");
}
