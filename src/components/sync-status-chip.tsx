"use client";

import { useState } from "react";
import { WifiOff, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";
import { useSyncStatus } from "@/lib/offline/use-sync-status";
import { ConflictResolverModal } from "./conflict-resolver-modal";
import { FailedOpsModal } from "./failed-ops-modal";

export function SyncStatusChip() {
  const {
    isOnline, pendingCount, conflictCount, conflictOps, failedCount, failedOps, isSyncing, refresh,
  } = useSyncStatus();
  const [conflictOpen, setConflictOpen] = useState(false);
  const [failedOpen, setFailedOpen] = useState(false);

  const hasConflict = conflictCount > 0;
  const hasFailed = failedCount > 0;

  let icon: React.ReactNode;
  let label: string;
  let chipClass: string;

  if (hasConflict) {
    icon = <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />;
    label = conflictCount === 1 ? "1 conflict" : `${conflictCount} conflicts`;
    chipClass = "bg-red-900/20 text-red-400 border border-red-900/30 hover:bg-red-900/30 cursor-pointer";
  } else if (hasFailed) {
    icon = <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />;
    label = failedCount === 1 ? "1 change failed" : `${failedCount} changes failed`;
    chipClass = "bg-red-900/20 text-red-400 border border-red-900/30 hover:bg-red-900/30 cursor-pointer";
  } else if (isSyncing) {
    icon = <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />;
    label = "Syncing\u2026";
    chipClass = "bg-blue-900/20 text-blue-400 border border-blue-900/30";
  } else if (!isOnline) {
    icon = <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />;
    label = pendingCount > 0 ? `Offline \u00b7 ${pendingCount} pending` : "Offline";
    chipClass = "bg-yellow-900/20 text-yellow-400 border border-yellow-900/30";
  } else {
    icon = <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />;
    label = "Up to date";
    chipClass = "text-text-muted border border-transparent";
  }

  return (
    <>
      <button
        type="button"
        disabled={!hasConflict && !hasFailed}
        onClick={() => (hasConflict ? setConflictOpen(true) : setFailedOpen(true))}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${chipClass} disabled:cursor-default`}
      >
        <span role="status" aria-live="polite" className="flex items-center gap-1.5">
          {icon}
          <span>{label}</span>
        </span>
      </button>

      <ConflictResolverModal
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        conflicts={conflictOps}
        onResolved={refresh}
      />

      <FailedOpsModal
        open={failedOpen}
        onOpenChange={setFailedOpen}
        failed={failedOps}
        onResolved={refresh}
      />
    </>
  );
}
