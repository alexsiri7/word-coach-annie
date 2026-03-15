"use client";

import { useState } from "react";
import DOMPurify from "dompurify";
import {
  Clock,
  X,
  Eye,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { timeAgo } from "./editor-config";
import type { ContentVersion } from "@/lib/types";

interface VersionHistoryPanelProps {
  nodeId: string;
  versionHistory: ContentVersion[];
  onClose: () => void;
  onRestored: (restored: { content: string; history: ContentVersion[] }) => void;
}

export function VersionHistoryPanel({
  nodeId,
  versionHistory,
  onClose,
  onRestored,
}: VersionHistoryPanelProps) {
  const [previewVersion, setPreviewVersion] = useState<ContentVersion | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [versionToRestore, setVersionToRestore] = useState<ContentVersion | null>(null);
  const [restoring, setRestoring] = useState(false);

  const handlePreviewVersion = async (version: ContentVersion) => {
    if (previewVersion?.id === version.id) {
      setPreviewVersion(null);
      setPreviewContent(null);
      return;
    }

    setLoadingPreview(true);
    setPreviewVersion(version);

    try {
      const res = await fetch(`/api/nodes/${nodeId}/content?versionId=${version.id}`);
      const data = await res.json();
      setPreviewContent(data.content || "");
    } catch {
      setPreviewContent("Failed to load version content.");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleRestoreVersion = async () => {
    if (!versionToRestore) return;
    setRestoring(true);

    try {
      const res = await fetch(`/api/nodes/${nodeId}/content`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: versionToRestore.id }),
      });

      if (res.ok) {
        const restored = await res.json();
        // Reload version history
        const histRes = await fetch(`/api/nodes/${nodeId}/content`);
        const histData = await histRes.json();

        onRestored({
          content: restored.content,
          history: histData.history || [],
        });

        setPreviewVersion(null);
        setPreviewContent(null);
      }
    } finally {
      setRestoring(false);
      setRestoreDialogOpen(false);
      setVersionToRestore(null);
    }
  };

  return (
    <>
      <div className="border-b border-border bg-surface-raised animate-slide-up shrink-0">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-accent" />
            <span className="text-xs font-medium text-text-secondary">
              Version History
            </span>
            <span className="text-xs text-text-muted">
              ({versionHistory.length} version{versionHistory.length !== 1 ? "s" : ""})
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="space-y-0.5 px-3 pb-3 max-h-48 overflow-y-auto">
          {versionHistory.length === 0 ? (
            <div className="text-xs text-text-muted py-3 text-center">No versions saved yet</div>
          ) : (
            versionHistory.map((v, i) => (
              <div
                key={v.id}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all",
                  previewVersion?.id === v.id
                    ? "bg-accent/10 border border-accent/20"
                    : i === 0
                      ? "bg-surface-overlay/30"
                      : "hover:bg-surface-overlay/50"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-text-secondary whitespace-nowrap">
                    {timeAgo(v.createdAt)}
                  </span>
                  <span className="text-text-muted tabular-nums whitespace-nowrap">
                    {v.wordCount.toLocaleString()} words
                  </span>
                  {i === 0 && (
                    <span className="tag-pill text-accent text-[10px] py-0">Current</span>
                  )}
                </div>

                {i > 0 && (
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] px-2 gap-1 text-text-muted hover:text-text-primary"
                      onClick={() => handlePreviewVersion(v)}
                    >
                      <Eye className="h-3 w-3" />
                      {previewVersion?.id === v.id ? "Hide" : "Preview"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] px-2 gap-1 text-accent hover:text-accent-hover"
                      onClick={() => {
                        setVersionToRestore(v);
                        setRestoreDialogOpen(true);
                      }}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restore
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Version preview */}
        {previewVersion && (
          <div className="border-t border-border px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                <Eye className="h-3 w-3 text-accent" />
                Preview: {timeAgo(previewVersion.createdAt)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-2 gap-1 text-accent"
                onClick={() => {
                  setVersionToRestore(previewVersion);
                  setRestoreDialogOpen(true);
                }}
              >
                <RotateCcw className="h-3 w-3" />
                Restore this version
              </Button>
            </div>
            <div className="version-preview-content rounded-lg bg-surface-sunken border border-border-subtle p-4 max-h-64 overflow-y-auto">
              {loadingPreview ? (
                <div className="flex items-center justify-center py-6">
                  <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div
                  className="text-sm text-text-secondary leading-relaxed prose-preview"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewContent || "") }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Restore confirmation dialog */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this version?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new version with the content from{" "}
              {versionToRestore ? timeAgo(versionToRestore.createdAt) : ""} ({versionToRestore?.wordCount.toLocaleString()} words).
              Your current content will be preserved in the version history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreVersion}
              disabled={restoring}
              className="gap-1.5"
            >
              {restoring ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {restoring ? "Restoring..." : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
