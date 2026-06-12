"use client";

import { useCallback, useEffect, useState } from "react";
import { getPendingOps, getConflictOps, type PendingOp } from "./idb";
import { addSyncListener } from "./sync-queue";
import { useNetworkStatus } from "./use-network-status";

export interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  conflictCount: number;
  conflictOps: PendingOp[];
  isSyncing: boolean;
}

export function useSyncStatus(): SyncStatus {
  const { isOnline } = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictOps, setConflictOps] = useState<PendingOp[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const ops = await getPendingOps();
      const nonConflict = ops.filter((o) => o.status !== "conflict");
      setPendingCount(nonConflict.length);
      const conflicts = await getConflictOps();
      setConflictOps(conflicts);
    } catch {
      // IndexedDB not available (SSR or error)
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    return addSyncListener((event) => {
      if (event.type === "replay-start") setIsSyncing(true);
      if (event.type === "replay-done") {
        setIsSyncing(false);
        refresh();
      }
      if (event.type === "replay-success" || event.type === "replay-conflict") {
        refresh();
      }
    });
  }, [refresh]);

  return {
    isOnline,
    pendingCount,
    conflictCount: conflictOps.length,
    conflictOps,
    isSyncing,
  };
}
