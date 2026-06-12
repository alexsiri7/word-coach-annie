import { useCallback, useRef } from "react";
import { beatsToComments } from "./editor-config";
import { offlineFetch } from "@/lib/offline/sync-queue";

interface UseAutoSaveOptions {
  nodeId: string;
  onSaveStart: () => void;
  onSaveEnd: () => void;
  onVersionCreated: (version: { id: string }) => void;
  onNodeUpdated?: () => void;
  onSaveError?: (err: { status: number; data: unknown }) => void;
  initialContentHash?: string | null;
}

export function useAutoSave({
  nodeId,
  onSaveStart,
  onSaveEnd,
  onVersionCreated,
  onNodeUpdated,
  onSaveError,
  initialContentHash,
}: UseAutoSaveOptions) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<string>("");
  const baseHashRef = useRef<string | null>(initialContentHash ?? null);

  const saveContent = useCallback(
    async (content: string) => {
      onSaveStart();
      try {
        const res = await offlineFetch(`/api/nodes/${nodeId}/content`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: beatsToComments(content), contentHash: baseHashRef.current }),
        });

        if (res.ok) {
          const newVersion = await res.json();
          onVersionCreated(newVersion);
          onNodeUpdated?.();
        } else if (res.status === 409) {
          const data = await res.json().catch(() => null);
          onSaveError?.({ status: 409, data });
        }
      } finally {
        onSaveEnd();
      }
    },
    [nodeId, onSaveStart, onSaveEnd, onVersionCreated, onNodeUpdated, onSaveError]
  );

  const scheduleSave = useCallback(
    (html: string) => {
      contentRef.current = html;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveContent(html);
      }, 2000);
    },
    [saveContent]
  );

  const saveNow = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (contentRef.current) {
      saveContent(contentRef.current);
    }
  }, [saveContent]);

  const cleanup = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
  }, []);

  return { saveContent, scheduleSave, saveNow, cleanup, contentRef };
}
