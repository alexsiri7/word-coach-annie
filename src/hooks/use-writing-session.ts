"use client";

import { useState, useEffect, useCallback } from "react";

const LAST_SCENE_KEY = "wca:last-scene";
const SESSION_KEY = "wca:session";
const GOAL_KEY = "wca:daily-goal";
const SESSION_INACTIVITY_MS = 5 * 60 * 1000; // 5 minutes

export interface LastScene {
  projectId: string;
  projectTitle: string;
  sceneId: string;
  sceneTitle: string;
  timestamp: number;
}

export interface WritingSession {
  date: string; // YYYY-MM-DD
  startWords: number;
  currentWords: number;
  lastActivityAt: number;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function useLastScene() {
  const [lastScene, setLastSceneState] = useState<LastScene | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_SCENE_KEY);
      if (raw) setLastSceneState(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const recordLastScene = useCallback((scene: LastScene) => {
    try {
      localStorage.setItem(LAST_SCENE_KEY, JSON.stringify(scene));
      setLastSceneState(scene);
    } catch {
      // ignore
    }
  }, []);

  const clearLastScene = useCallback(() => {
    localStorage.removeItem(LAST_SCENE_KEY);
    setLastSceneState(null);
  }, []);

  return { lastScene, recordLastScene, clearLastScene };
}

export function useDailyWordGoal() {
  const [goal, setGoalState] = useState<number>(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GOAL_KEY);
      if (raw) setGoalState(parseInt(raw, 10) || 0);
    } catch {
      // ignore
    }
  }, []);

  const setGoal = useCallback((words: number) => {
    try {
      localStorage.setItem(GOAL_KEY, String(words));
      setGoalState(words);
    } catch {
      // ignore
    }
  }, []);

  return { goal, setGoal };
}

export function useWritingSession() {
  const [session, setSessionState] = useState<WritingSession | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed: WritingSession = JSON.parse(raw);
        // Reset if it's a new day or session timed out
        if (parsed.date !== todayStr()) {
          localStorage.removeItem(SESSION_KEY);
        } else {
          setSessionState(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const recordWords = useCallback((currentWordCount: number) => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      const today = todayStr();
      let updated: WritingSession;

      if (raw) {
        const existing: WritingSession = JSON.parse(raw);
        if (existing.date !== today) {
          // New day — start fresh
          updated = {
            date: today,
            startWords: currentWordCount,
            currentWords: currentWordCount,
            lastActivityAt: Date.now(),
          };
        } else {
          const timeSinceLast = Date.now() - existing.lastActivityAt;
          if (timeSinceLast > SESSION_INACTIVITY_MS) {
            // Session timed out — new session starts at current count
            updated = {
              date: today,
              startWords: currentWordCount,
              currentWords: currentWordCount,
              lastActivityAt: Date.now(),
            };
          } else {
            updated = {
              ...existing,
              currentWords: Math.max(existing.currentWords, currentWordCount),
              lastActivityAt: Date.now(),
            };
          }
        }
      } else {
        updated = {
          date: today,
          startWords: currentWordCount,
          currentWords: currentWordCount,
          lastActivityAt: Date.now(),
        };
      }

      localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
      setSessionState(updated);
    } catch {
      // ignore
    }
  }, []);

  const wordsWrittenToday = session ? Math.max(0, session.currentWords - session.startWords) : 0;

  return { session, recordWords, wordsWrittenToday };
}
