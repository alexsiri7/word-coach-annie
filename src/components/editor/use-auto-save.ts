import { useCallback, useRef } from "react";
import { beatsToComments } from "./editor-config";
import { offlineFetch } from "@/lib/offline/sync-queue";
import { computeContentHash } from "@/lib/offline/content-hash";

interface UseAutoSaveOptions {
  nodeId: string;
  initialContent?: string;
  onSaveStart: () => void;
  onSaveEnd: () => void;
  onVersionCreated: (version: { id: string }) => void;
  onNodeUpdated?: () => void;
  onSaveError?: (status: number) => void;
}

export function useAutoSave({
  nodeId,
  initialContent,
  onSaveStart,
  onSaveEnd,
  onVersionCreated,
  onNodeUpdated,
  onSaveError,
}: UseAutoSaveOptions) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<string>("");
  // Tracks the SHA-256 of the last server-confirmed content.
  // Sent as contentHash so the server can detect concurrent edits (→ 409).
  const baseHashRef = useRef<string | null>(null);

  // Seed base hash from initial content on first render
  const initBaseHash = useCallback(async () => {
    if (baseHashRef.current !== null || !initialContent) return;
    baseHashRef.current = await computeContentHash(initialContent);
  }, [initialContent]);

  // Initiate at most once per mount — fire-and-forget, avoids a useEffect re-render cycle.
  // The guard inside initBaseHash prevents concurrent invocations.
  if (baseHashRef.current === null && initialContent) {
    initBaseHash().catch((err) =>
      console.warn("[useAutoSave] Failed to seed base hash:", err)
    );
  }

  const saveContent = useCallback(
    async (content: string) => {
      onSaveStart();
      try {
        const processedContent = beatsToComments(content);
        const body: Record<string, string> = { content: processedContent };

        // Include base hash for optimistic-locking if we have one
        if (baseHashRef.current !== null) {
          body.contentHash = baseHashRef.current;
        }

        const res = await offlineFetch(`/api/nodes/${nodeId}/content`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const newVersion = await res.json();
          // Update base hash to the content we just confirmed with the server
          baseHashRef.current = await computeContentHash(processedContent);
          onVersionCreated(newVersion);
          onNodeUpdated?.();
        } else if (res.status === 202) {
          // Queued offline — don't update baseHashRef; the queued op carries
          // the current baseHashRef value in its body already
        } else {
          // Save failed (including online 409 conflict) — log and surface to caller
          console.error(`[useAutoSave] save failed with status ${res.status} for node ${nodeId}`);
          onSaveError?.(res.status);
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
