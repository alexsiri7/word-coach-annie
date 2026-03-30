"use client";

import { Check, Clock, Zap } from "lucide-react";

interface EditorStatusBarProps {
  wordCount: number;
  saving: boolean;
  lastSaved: string | null;
  sessionWordsWritten?: number;
  sessionDurationSeconds?: number;
  sessionWordsPerHour?: number;
  sessionActive?: boolean;
}

export function EditorStatusBar({
  wordCount,
  saving,
  lastSaved,
  sessionWordsWritten = 0,
  sessionDurationSeconds = 0,
  sessionWordsPerHour = 0,
  sessionActive = false,
}: EditorStatusBarProps) {
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 238));

  return (
    <footer
      className="flex items-center justify-between px-6 py-2.5 bg-surface-raised/80 backdrop-blur-md border-t border-border/50 text-[10px] uppercase font-medium tracking-wider shrink-0"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-8">
        {/* Word Count */}
        <div className="flex items-center gap-2">
          <span className="text-text-muted">Words</span>
          <span className="font-bold text-accent tabular-nums">
            {wordCount.toLocaleString()}
          </span>
        </div>

        {/* Reading Time */}
        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3 text-text-muted" aria-hidden="true" />
          <span className="text-text-muted">Reading</span>
          <span className="font-bold text-text-primary tabular-nums">
            {readingTimeMinutes} min
          </span>
        </div>

        {/* Session Stats */}
        {sessionActive && sessionWordsWritten > 0 && (
          <div className="flex items-center gap-2">
            <Zap className="h-3 w-3 text-accent" aria-hidden="true" />
            <span className="text-text-muted">Session</span>
            <span className="font-bold text-accent tabular-nums">
              {sessionWordsWritten.toLocaleString()} words
              {" / "}
              {sessionDurationSeconds < 60
                ? `${sessionDurationSeconds}s`
                : `${Math.round(sessionDurationSeconds / 60)} min`}
            </span>
            {sessionWordsPerHour > 0 && sessionDurationSeconds >= 60 && (
              <span className="text-text-muted tabular-nums">
                ({sessionWordsPerHour.toLocaleString()} wph)
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-6">
        {/* Save Status */}
        <div className="flex items-center gap-2">
          {saving ? (
            <>
              <div className="h-2.5 w-2.5 border border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-text-muted">Saving...</span>
            </>
          ) : lastSaved ? (
            <>
              <Check className="h-3 w-3 text-accent" aria-hidden="true" />
              <span className="text-text-muted">
                Saved {lastSaved}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
