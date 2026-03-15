import { useCallback, useRef } from "react";
import { beatsToComments } from "./editor-config";
import { offlineFetch } from "@/lib/offline/sync-queue";

interface UseAutoSaveOptions {
  nodeId: string;
  onSaveStart: () => void;
  onSaveEnd: () => void;
  onVersionCreated: (version: { id: string }) => void;
  onNodeUpdated?: () => void;
}

export function useAutoSave({
  nodeId,
  onSaveStart,
  onSaveEnd,
  onVersionCreated,
  onNodeUpdated,
}: UseAutoSaveOptions) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<string>("");

  const saveContent = useCallback(
    async (content: string) => {
      onSaveStart();
      try {
        const res = await offlineFetch(`/api/nodes/${nodeId}/content`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: beatsToComments(content) }),
        });

        if (res.ok) {
          const newVersion = await res.json();
          onVersionCreated(newVersion);
          onNodeUpdated?.();
        }
      } finally {
        onSaveEnd();
      }
    },
    [nodeId, onSaveStart, onSaveEnd, onVersionCreated, onNodeUpdated]
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
