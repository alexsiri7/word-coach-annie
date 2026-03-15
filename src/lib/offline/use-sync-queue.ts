"use client";

import { useEffect, useRef } from "react";
import { useNetworkStatus } from "./use-network-status";
import { replayPendingOps, addSyncListener, type SyncEvent } from "./sync-queue";

/**
 * React hook that triggers pending-op replay when the browser comes back
 * online and forwards sync events to a callback.
 */
export function useSyncQueue(onSyncEvent?: (event: SyncEvent) => void) {
  const { isOnline } = useNetworkStatus();
  const prevOnline = useRef(isOnline);

  // Subscribe to sync events
  useEffect(() => {
    if (!onSyncEvent) return;
    return addSyncListener(onSyncEvent);
  }, [onSyncEvent]);

  // Trigger replay on reconnect (offline → online transition)
  useEffect(() => {
    if (!prevOnline.current && isOnline) {
      replayPendingOps();
    }
    prevOnline.current = isOnline;
  }, [isOnline]);
}
