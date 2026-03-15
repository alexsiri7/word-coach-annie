"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useNetworkStatus } from "@/lib/offline/use-network-status";

export function OfflineIndicator() {
  const { isOnline } = useNetworkStatus();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setVisible(true);
    } else {
      // Delay hiding to allow the exit animation to play
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  if (!visible && isOnline) return null;

  return (
    <div
      className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ${
        !isOnline
          ? "translate-y-0 opacity-100"
          : "translate-y-2 opacity-0"
      }`}
    >
      <div className="flex items-center gap-2 rounded-full bg-yellow-900/90 px-4 py-2 text-sm text-yellow-100 shadow-lg backdrop-blur-sm" role="status" aria-live="polite">
        <WifiOff className="h-4 w-4" aria-hidden="true" />
        <span>Offline — changes saved locally</span>
      </div>
    </div>
  );
}
