import { useCallback, useRef } from "react";
import { beatsToComments } from "./editor-config";
import { offlineFetch } from "@/lib/offline/sync-queue";
import { computeOfflineContentHash } from "@/lib/offline/content-hash";
import { sendWithSessionRetry, streakRefresher, type StreakRefresher } from "@/lib/offline/replay-shared";

interface UseAutoSaveOptions {
  nodeId: string;
  onSaveStart: () => void;
  onSaveEnd: () => void;
  onVersionCreated: (version: { id: string }) => void;
  onNodeUpdated?: () => void;
  onSaveError?: (err: { status: number; data: unknown }) => void;
}

export function useAutoSave({
  nodeId,
  onSaveStart,
  onSaveEnd,
  onVersionCreated,
  onNodeUpdated,
  onSaveError,
}: UseAutoSaveOptions) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<string>("");
  const baseHashRef = useRef<string | null>(null);
  // Autosave fires every few seconds while typing; refreshing on each failing
  // save would trip the refresh rate limit, so a streak of failures shares a
  // refresher, dropped once a save gets past auth.
  const refresherRef = useRef<StreakRefresher | null>(null);

  const saveContent = useCallback(
    async (content: string) => {
      onSaveStart();
      try {
        const body = JSON.stringify({ content: beatsToComments(content), contentHash: baseHashRef.current });
        const refresher = (refresherRef.current = streakRefresher(refresherRef.current, Date.now()));
        const res = await sendWithSessionRetry(
          () =>
            offlineFetch(`/api/nodes/${nodeId}/content`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
            }),
          refresher.refresh
        );

        if (res.status !== 401) refresherRef.current = null;

        if (res.ok) {
          const newVersion = await res.json();
          onVersionCreated(newVersion);
          onNodeUpdated?.();
          // Prefer the server's hash of what it stored (sanitized); a queued
          // offline save has none, so fall back to hashing what was sent.
          if (typeof newVersion.contentHash === "string") {
            baseHashRef.current = newVersion.contentHash;
          } else {
            computeOfflineContentHash(beatsToComments(content)).then((h) => {
              baseHashRef.current = h;
            });
          }
        } else if (res.status === 409) {
          const data = await res.json().catch(() => null);
          onSaveError?.({ status: 409, data });
        } else {
          const data = await res.json().catch(() => null);
          console.warn("[auto-save] save failed", { status: res.status, data });
          onSaveError?.({ status: res.status, data });
        }
      } catch (err) {
        console.warn("[auto-save] save failed", err);
        onSaveError?.({ status: 0, data: null });
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

  const setBaseHash = useCallback((hash: string | null) => {
    baseHashRef.current = hash;
  }, []);

  return { saveContent, scheduleSave, saveNow, cleanup, contentRef, setBaseHash };
}
