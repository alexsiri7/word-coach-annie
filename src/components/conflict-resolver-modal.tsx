"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { forceReplayOp } from "@/lib/offline/sync-queue";
import { removePendingOp, type PendingOp } from "@/lib/offline/idb";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: PendingOp[];
  onResolved: () => void;
}

export function parseContent(raw: string | null | undefined): string {
  if (!raw) return "(no content)";
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed.content === "string" ? parsed.content : JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function ConflictResolverModal({ open, onOpenChange, conflicts, onResolved }: Props) {
  const [index, setIndex] = useState(0);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const op = conflicts[index];
  if (!op) return null;

  const serverText = stripHtml(parseContent(op.serverContent));
  const localText = stripHtml(parseContent(op.body));
  const shortUrl = op.url.split("/").slice(-3).join("/");

  const resolve = async (action: "keep-mine" | "keep-server") => {
    setResolving(true);
    setResolveError(null);
    try {
      if (action === "keep-mine") {
        const ok = await forceReplayOp(op.id!);
        if (!ok) {
          setResolveError("Could not apply your version. Check your connection and try again.");
          return;
        }
      } else {
        await removePendingOp(op.id!);
      }
      onResolved();
      if (index >= conflicts.length - 1) {
        onOpenChange(false);
        setIndex(0);
      } else {
        setIndex((i) => i);
      }
    } catch {
      setResolveError("An unexpected error occurred. Please try again.");
    } finally {
      setResolving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" aria-hidden="true" />
            Resolve Conflict
          </DialogTitle>
          <DialogDescription>
            {shortUrl} — conflict {index + 1} of {conflicts.length}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">Server version</p>
            <div className="h-48 overflow-y-auto rounded-sm border border-border/15 bg-surface-sunken p-3 text-sm text-text-secondary whitespace-pre-wrap font-mono">
              {serverText}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">Your offline edit</p>
            <div className="h-48 overflow-y-auto rounded-sm border border-accent/30 bg-surface-sunken p-3 text-sm text-text-primary whitespace-pre-wrap font-mono">
              {localText}
            </div>
          </div>
        </div>

        {resolveError && (
          <p className="text-sm text-red-400">{resolveError}</p>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={resolving}>
            Close
          </Button>
          <Button variant="outline" size="sm" disabled={resolving} onClick={() => resolve("keep-server")}>
            Keep server version
          </Button>
          <Button size="sm" disabled={resolving} onClick={() => resolve("keep-mine")}>
            {resolving ? "Saving\u2026" : "Keep my version"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
