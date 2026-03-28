"use client";

import { useEffect, useRef, useCallback, useState } from "react";

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface UseWritingSessionOptions {
  projectId: string;
  nodeId: string;
  initialWordCount: number;
}

interface SessionStats {
  wordsWritten: number;
  durationSeconds: number;
}

export function useWritingSession({ projectId, nodeId, initialWordCount }: UseWritingSessionOptions) {
  const sessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<Date | null>(null);
  const baseWordCountRef = useRef<number>(initialWordCount);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);

  const endSession = useCallback(async (currentWordCount: number) => {
    if (!sessionIdRef.current || !startedAtRef.current) return;

    const sessionId = sessionIdRef.current;
    const startedAt = startedAtRef.current;
    sessionIdRef.current = null;
    startedAtRef.current = null;

    const wordsWritten = Math.max(0, currentWordCount - baseWordCountRef.current);
    const duration = Math.round((Date.now() - startedAt.getTime()) / 1000);

    try {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end", sessionId, projectId, wordsWritten, duration }),
      });
    } catch {
      // Non-critical; silently ignore
    }
  }, [projectId]);

  const startSession = useCallback(async () => {
    if (sessionIdRef.current) return; // Already active

    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", projectId, nodeId }),
      });
      if (res.ok) {
        const data = await res.json();
        sessionIdRef.current = data.id;
        startedAtRef.current = new Date();
      }
    } catch {
      // Non-critical; silently ignore
    }
  }, [projectId, nodeId]);

  const onKeystroke = useCallback((currentWordCount: number) => {
    // Start session on first keystroke
    startSession();

    // Update live session stats
    if (startedAtRef.current) {
      const wordsWritten = Math.max(0, currentWordCount - baseWordCountRef.current);
      const durationSeconds = Math.round((Date.now() - startedAtRef.current.getTime()) / 1000);
      setSessionStats({ wordsWritten, durationSeconds });
    }

    // Reset inactivity timer
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      endSession(currentWordCount);
    }, INACTIVITY_TIMEOUT_MS);
  }, [startSession, endSession]);

  // Update base word count when it changes (e.g., scene loads)
  useEffect(() => {
    baseWordCountRef.current = initialWordCount;
  }, [initialWordCount]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      // End session on unmount — use captured ref values
      if (sessionIdRef.current && startedAtRef.current) {
        const sessionId = sessionIdRef.current;
        const startedAt = startedAtRef.current;
        const wordsWritten = Math.max(0, (sessionStats?.wordsWritten || 0));
        const duration = Math.round((Date.now() - startedAt.getTime()) / 1000);

        fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "end", sessionId, projectId, wordsWritten, duration }),
        }).catch(() => {});
      }
    };
  }, [projectId, sessionStats?.wordsWritten]);

  return { onKeystroke, sessionStats };
}
