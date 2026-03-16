"use client";

import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { useNetworkStatus } from "@/lib/offline/use-network-status";
import { usePendingOpsCount } from "@/lib/offline/use-pending-ops-count";

export function OfflineIndicator() {
  const { isOnline, wasOffline } = useNetworkStatus();
  const pendingCount = usePendingOpsCount();
  const [visible, setVisible] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setVisible(true);
      setShowReconnected(false);
    } else if (wasOffline) {
      // Show "Back online" briefly when reconnecting
      setShowReconnected(true);
      const hideTimer = setTimeout(() => {
        setShowReconnected(false);
        setVisible(false);
      }, 3000);
      return () => clearTimeout(hideTimer);
    } else {
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  if (!visible && isOnline) return null;

  const isReconnecting = isOnline && showReconnected;

  return (
    <div
      className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ${
        visible && (!isOnline || showReconnected)
          ? "translate-y-0 opacity-100"
          : "translate-y-2 opacity-0"
      }`}
    >
      <div
        className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm shadow-lg backdrop-blur-sm ${
          isReconnecting
            ? "bg-green-900/90 text-green-100"
            : "bg-yellow-900/90 text-yellow-100"
        }`}
        role="status"
        aria-live="polite"
      >
        {isReconnecting ? (
          <>
            <Wifi className="h-4 w-4" aria-hidden="true" />
            <span>Back online — syncing changes</span>
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" aria-hidden="true" />
            <span>
              You&apos;re offline — changes will sync when reconnected
              {pendingCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-yellow-100/20 px-1.5 text-xs font-medium">
                  {pendingCount} pending
                </span>
              )}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
