"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { retryFailedOp } from "@/lib/offline/sync-queue";
import { removePendingOp, type PendingOp } from "@/lib/offline/idb";
import { parseContent, stripHtml } from "./conflict-resolver-modal";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  failed: PendingOp[];
  onResolved: () => void;
}

export function FailedOpsModal({ open, onOpenChange, failed, onResolved }: Props) {
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  if (failed.length === 0) return null;

  const act = async (op: PendingOp, action: "retry" | "discard") => {
    const id = op.id!;
    setBusyIds((ids) => new Set(ids).add(id));
    setActionError(null);
    try {
      if (action === "retry") {
        const ok = await retryFailedOp(id);
        if (!ok) {
          setActionError("This change still couldn't sync. Check your connection and try again.");
          return;
        }
      } else {
        await removePendingOp(id);
      }
      onResolved();
      if (failed.length <= 1) onOpenChange(false);
    } catch {
      setActionError("Something went wrong. Please try again.");
    } finally {
      setBusyIds((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
            Changes that couldn&apos;t sync
          </DialogTitle>
          <DialogDescription>
            These offline edits failed to save after several attempts. Retry them, or copy your text and discard.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-[60vh] space-y-4 overflow-y-auto py-2">
          {failed.map((op) => {
            const busy = busyIds.has(op.id!);
            return (
              <li key={op.id} className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
                  {op.url.split("/").slice(-3).join("/")}
                </p>
                <div className="h-32 overflow-y-auto rounded-sm border border-accent/30 bg-surface-sunken p-3 text-sm text-text-primary whitespace-pre-wrap font-mono">
                  {stripHtml(parseContent(op.body))}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => act(op, "discard")}>
                    Discard
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => act(op, "retry")}>
                    {busy ? "Working…" : "Retry"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        {actionError && (
          <p className="text-sm text-red-400">{actionError}</p>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
