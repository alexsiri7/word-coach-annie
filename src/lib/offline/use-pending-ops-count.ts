"use client";

import { useCallback, useEffect, useState } from "react";
import { getPendingOps } from "./idb";
import { useNetworkStatus } from "./use-network-status";

/**
 * Returns the count of pending offline operations queued in IndexedDB.
 * Polls while offline to keep the count fresh as new ops are queued.
 */
export function usePendingOpsCount(): number {
  const [count, setCount] = useState(0);
  const { isOnline } = useNetworkStatus();

  const refresh = useCallback(async () => {
    try {
      const ops = await getPendingOps();
      setCount(ops.length);
    } catch {
      // IndexedDB not available (SSR or error)
    }
  }, []);

  useEffect(() => {
    refresh();

    // Poll more frequently when offline (ops may be queuing)
    if (!isOnline) {
      const interval = setInterval(refresh, 3000);
      return () => clearInterval(interval);
    }
  }, [isOnline, refresh]);

  return count;
}
