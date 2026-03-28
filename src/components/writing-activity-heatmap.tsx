"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface HeatmapDay {
  date: string; // YYYY-MM-DD
  words: number;
  sessions: number;
}

interface WritingActivityHeatmapProps {
  projectId: string;
}

function getIntensityClass(words: number, maxWords: number): string {
  if (words === 0) return "bg-surface-base border border-border";
  const ratio = words / maxWords;
  if (ratio < 0.25) return "bg-accent/20";
  if (ratio < 0.5) return "bg-accent/40";
  if (ratio < 0.75) return "bg-accent/65";
  return "bg-accent/90";
}

function buildDateGrid(days: HeatmapDay[]): { week: HeatmapDay[] }[] {
  const today = new Date();
  const result: { week: HeatmapDay[] }[] = [];
  const dayMap = new Map(days.map((d) => [d.date, d]));

  // Go back 27 days to get 4 full weeks
  const start = new Date(today);
  start.setDate(today.getDate() - 27);

  // Align to Sunday
  const dayOfWeek = start.getDay();
  start.setDate(start.getDate() - dayOfWeek);

  let current = new Date(start);
  while (current <= today) {
    const week: HeatmapDay[] = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = current.toISOString().slice(0, 10);
      const isFuture = current > today;
      week.push(
        isFuture
          ? { date: dateStr, words: -1, sessions: 0 } // sentinel for future
          : dayMap.get(dateStr) || { date: dateStr, words: 0, sessions: 0 }
      );
      current = new Date(current);
      current.setDate(current.getDate() + 1);
    }
    result.push({ week });
  }
  return result;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WritingActivityHeatmap({ projectId }: WritingActivityHeatmapProps) {
  const [days, setDays] = useState<HeatmapDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalWords, setTotalWords] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);

  useEffect(() => {
    fetch(`/api/sessions?projectId=${projectId}&days=28`)
      .then((r) => r.json())
      .then((data) => {
        const heatDays: HeatmapDay[] = Object.entries(
          data.byDate as Record<string, { words: number; sessions: number }>
        ).map(([date, val]) => ({ date, words: val.words, sessions: val.sessions }));
        setDays(heatDays);
        setTotalWords(heatDays.reduce((s, d) => s + d.words, 0));
        setTotalSessions(heatDays.reduce((s, d) => s + d.sessions, 0));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return <div className="h-20 animate-pulse bg-surface-raised rounded" />;
  }

  const maxWords = Math.max(1, ...days.map((d) => d.words));
  const grid = buildDateGrid(days);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">Writing activity — past 4 weeks</p>
        {totalSessions > 0 && (
          <p className="text-xs text-text-muted tabular-nums">
            {totalWords.toLocaleString()} words across {totalSessions} session{totalSessions !== 1 ? "s" : ""}
          </p>
        )}
      </div>
      <div className="flex gap-1">
        {/* Day labels column */}
        <div className="flex flex-col gap-1 pt-0.5 mr-0.5">
          {DAY_LABELS.map((label) => (
            <div key={label} className="h-4 w-7 text-[10px] text-text-muted flex items-center">
              {label}
            </div>
          ))}
        </div>
        {/* Week columns */}
        {grid.map(({ week }, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day) => {
              const isFuture = day.words === -1;
              return (
                <div
                  key={day.date}
                  title={
                    isFuture
                      ? ""
                      : day.words > 0
                      ? `${day.date}: ${day.words.toLocaleString()} words`
                      : day.date
                  }
                  className={cn(
                    "h-4 w-4 rounded-sm",
                    isFuture
                      ? "opacity-0 pointer-events-none"
                      : getIntensityClass(day.words, maxWords)
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
