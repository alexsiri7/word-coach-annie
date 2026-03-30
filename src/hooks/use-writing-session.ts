"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const INACTIVITY_MS = 5 * 60 * 1000; // 5 minutes
const TICK_INTERVAL_MS = 1000; // Update display every second

interface UseWritingSessionOptions {
  projectId: string;
  nodeId: string;
  enabled?: boolean;
}

export interface WritingSessionStats {
  wordsWritten: number;
  durationSeconds: number;
  wordsPerHour: number;
  active: boolean;
  onActivity: (wordCount: number) => void;
}

export function useWritingSession({
  projectId,
  nodeId,
  enabled = true,
}: UseWritingSessionOptions): WritingSessionStats {
  const startTimeRef = useRef<number | null>(null);
  const startWordCountRef = useRef<number | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentWordCountRef = useRef<number>(0);
  const activeRef = useRef(false);
  const [stats, setStats] = useState({ wordsWritten: 0, durationSeconds: 0, wordsPerHour: 0, active: false });

  const stopTick = useCallback(() => {
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const startTick = useCallback(() => {
    stopTick();
    tickTimerRef.current = setInterval(() => {
      if (startTimeRef.current !== null && startWordCountRef.current !== null) {
        const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
        const wordsWritten = Math.max(0, currentWordCountRef.current - startWordCountRef.current);
        const hours = durationSeconds / 3600;
        const wordsPerHour = hours > 0 ? Math.round(wordsWritten / hours) : 0;
        setStats({ wordsWritten, durationSeconds, wordsPerHour, active: true });
      }
    }, TICK_INTERVAL_MS);
  }, [stopTick]);

  const endSession = useCallback(async () => {
    if (!activeRef.current || startTimeRef.current === null) return;
    activeRef.current = false;
    stopTick();

    const endedAt = new Date();
    const durationSeconds = Math.round((endedAt.getTime() - startTimeRef.current) / 1000);
    const wordsWritten = Math.max(
      0,
      currentWordCountRef.current - (startWordCountRef.current ?? 0),
    );

    const startedAt = new Date(startTimeRef.current).toISOString();
    startTimeRef.current = null;
    startWordCountRef.current = null;

    setStats({ wordsWritten: 0, durationSeconds: 0, wordsPerHour: 0, active: false });

    if (durationSeconds < 5 || wordsWritten === 0) return; // skip trivially short sessions

    try {
      await fetch(`/api/projects/${projectId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeId,
          startedAt,
          endedAt: endedAt.toISOString(),
          wordsWritten,
          durationSeconds,
          date: new Date().toISOString().slice(0, 10),
        }),
      });
    } catch {
      // best-effort: don't block writing on session tracking failure
    }
  }, [projectId, nodeId]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(endSession, INACTIVITY_MS);
  }, [endSession]);

  const onActivity = useCallback(
    (wordCount: number) => {
      if (!enabled) return;
      currentWordCountRef.current = wordCount;

      if (!activeRef.current) {
        // Start new session
        activeRef.current = true;
        startTimeRef.current = Date.now();
        startWordCountRef.current = wordCount;
        startTick();
      }

      resetInactivityTimer();

      if (startTimeRef.current !== null && startWordCountRef.current !== null) {
        const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
        const wordsWritten = Math.max(0, wordCount - startWordCountRef.current);
        const hours = durationSeconds / 3600;
        const wordsPerHour = hours > 0 ? Math.round(wordsWritten / hours) : 0;
        setStats({ wordsWritten, durationSeconds, wordsPerHour, active: true });
      }
    },
    [enabled, resetInactivityTimer, startTick],
  );

  // End session on unmount
  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      stopTick();
      endSession();
    };
  }, [endSession, stopTick]);

  // End session when nodeId changes (scene switched)
  const prevNodeIdRef = useRef(nodeId);
  useEffect(() => {
    if (prevNodeIdRef.current !== nodeId) {
      endSession();
      prevNodeIdRef.current = nodeId;
    }
  }, [nodeId, endSession]);

  return { ...stats, onActivity };
}
