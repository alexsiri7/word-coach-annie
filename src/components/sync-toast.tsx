"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, X } from "lucide-react";
import { useSyncQueue } from "@/lib/offline/use-sync-queue";
import type { SyncEvent } from "@/lib/offline/sync-queue";

interface Toast {
  id: number;
  message: string;
  variant: "info" | "success" | "warning" | "error";
}

let toastId = 0;

export function SyncToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (message: string, variant: Toast["variant"], duration = 4000) => {
      const id = ++toastId;
      setToasts((prev) => [...prev.slice(-4), { id, message, variant }]);
      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
    },
    []
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleSync = useCallback(
    (event: SyncEvent) => {
      switch (event.type) {
        case "replay-start":
          addToast(`Syncing ${event.total} queued change${event.total > 1 ? "s" : ""}...`, "info", 0);
          break;
        case "replay-success":
          addToast(
            `Synced: ${methodLabel(event.op.method)} ${shortUrl(event.op.url)}`,
            "success"
          );
          break;
        case "replay-conflict":
          addToast(
            `Conflict: ${shortUrl(event.op.url)} — server version kept`,
            "warning"
          );
          break;
        case "replay-error":
          addToast(
            `Failed: ${shortUrl(event.op.url)} — ${event.error}`,
            "error"
          );
          break;
        case "replay-done": {
          // Remove lingering "Syncing..." info toast
          setToasts((prev) => prev.filter((t) => t.variant !== "info"));
          const parts: string[] = [];
          if (event.succeeded) parts.push(`${event.succeeded} synced`);
          if (event.conflicts) parts.push(`${event.conflicts} conflict${event.conflicts > 1 ? "s" : ""}`);
          if (event.failed) parts.push(`${event.failed} failed`);
          addToast(
            `Sync complete: ${parts.join(", ")}`,
            event.failed > 0 ? "warning" : "success"
          );
          break;
        }
      }
    },
    [addToast]
  );

  useSyncQueue(handleSync);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-14 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm shadow-lg backdrop-blur-sm transition-all duration-300 ${variantStyles[toast.variant]}`}
        >
          {variantIcon[toast.variant]}
          <span>{toast.message}</span>
          <button
            onClick={() => dismiss(toast.id)}
            className="ml-2 opacity-60 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const variantStyles: Record<Toast["variant"], string> = {
  info: "bg-blue-900/90 text-blue-100",
  success: "bg-green-900/90 text-green-100",
  warning: "bg-yellow-900/90 text-yellow-100",
  error: "bg-red-900/90 text-red-100",
};

const variantIcon: Record<Toast["variant"], React.ReactNode> = {
  info: <Loader2 className="h-4 w-4 animate-spin" />,
  success: <CheckCircle2 className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  error: <XCircle className="h-4 w-4" />,
};

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
  // "/api/projects/abc123/nodes/xyz" → "projects/.../nodes/..."
  return url
    .replace("/api/", "")
    .replace(/\/[a-z0-9-]{8,}/gi, "/...");
}
