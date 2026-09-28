"use client";

import { useCallback, useEffect, useState } from "react";
import { getPendingOps, type PendingOp } from "./idb";
import { addSyncListener, classifySyncOps } from "./sync-queue";
import { useNetworkStatus } from "./use-network-status";

export interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  conflictCount: number;
  conflictOps: PendingOp[];
  failedCount: number;
  failedOps: PendingOp[];
  isSyncing: boolean;
  refresh: () => void;
}

export function useSyncStatus(): SyncStatus {
  const { isOnline } = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictOps, setConflictOps] = useState<PendingOp[]>([]);
  const [failedOps, setFailedOps] = useState<PendingOp[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const queue = classifySyncOps(await getPendingOps());
      setPendingCount(queue.pendingCount);
      setConflictOps(queue.conflictOps);
      setFailedOps(queue.failedOps);
    } catch (err) {
      // IndexedDB not available (SSR or error)
      if (typeof window !== "undefined") {
        console.warn("[sync] useSyncStatus: IndexedDB error", err);
      }
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
      if (event.type === "replay-success" ||
        event.type === "replay-conflict" ||
        event.type === "replay-error") {
        refresh();
      }
    });
  }, [refresh]);

  return {
    isOnline,
    pendingCount,
    conflictCount: conflictOps.length,
    conflictOps,
    failedCount: failedOps.length,
    failedOps,
    isSyncing,
    refresh,
  };
}
