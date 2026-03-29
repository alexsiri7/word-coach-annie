"use client";

import { useEffect, useState } from "react";
import type { HeatmapDay } from "@/lib/controllers/sessions";

// Maximum words in a day to normalize color intensity (adjust as needed)
const MAX_WORDS = 2000;

function getIntensity(words: number): number {
  if (words === 0) return 0;
  return Math.min(1, words / MAX_WORDS);
}

function intensityClass(intensity: number): string {
  if (intensity === 0) return "bg-surface-overlay";
  if (intensity < 0.2) return "bg-accent/20";
  if (intensity < 0.4) return "bg-accent/40";
  if (intensity < 0.65) return "bg-accent/65";
  return "bg-accent";
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function WritingHeatmap() {
  const [days, setDays] = useState<HeatmapDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalWords, setTotalWords] = useState(0);
  const [activeDays, setActiveDays] = useState(0);

  useEffect(() => {
    fetch("/api/sessions/heatmap")
      .then((r) => r.json())
      .then((data: HeatmapDay[]) => {
        if (Array.isArray(data)) {
          setDays(data);
          setTotalWords(data.reduce((sum, d) => sum + d.wordsWritten, 0));
          setActiveDays(data.filter((d) => d.wordsWritten > 0).length);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (totalWords === 0) return null; // Don't show heatmap if no activity yet

  // Arrange days into weeks (columns) — Sunday-first
  // Pad the start so first day aligns with correct weekday
  const firstDate = days[0] ? new Date(days[0].date + "T00:00:00") : new Date();
  const startPad = firstDate.getDay(); // 0=Sun
  const padded: (HeatmapDay | null)[] = [
    ...Array(startPad).fill(null),
    ...days,
  ];
  // Build weeks (7-row columns)
  const weeks: (HeatmapDay | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7));
  }

  // Month label positions: find first day of each month
  const monthLabels: { col: number; label: string }[] = [];
  for (let w = 0; w < weeks.length; w++) {
    for (let d = 0; d < weeks[w].length; d++) {
      const day = weeks[w][d];
      if (day && day.date.endsWith("-01")) {
        const month = parseInt(day.date.slice(5, 7), 10) - 1;
        monthLabels.push({ col: w, label: MONTH_NAMES[month] });
      }
    }
  }

  return (
    <div className="glass-card p-5 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text-secondary">Writing Activity</h3>
        <span className="text-xs text-text-muted">
          {activeDays} active {activeDays === 1 ? "day" : "days"} ·{" "}
          {totalWords >= 1000 ? `${(totalWords / 1000).toFixed(1)}k` : totalWords} words (4 weeks)
        </span>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {/* Day-of-week labels */}
        <div className="flex flex-col gap-0.5 mr-1 shrink-0">
          <div className="h-4" /> {/* spacer for month label row */}
          {DAY_LABELS.map((label, i) => (
            <div
              key={i}
              className={`h-[10px] w-4 text-[8px] text-text-muted flex items-center ${
                i % 2 === 0 ? "opacity-0" : ""
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => {
          const monthLabel = monthLabels.find((m) => m.col === wi);
          return (
            <div key={wi} className="flex flex-col gap-0.5 shrink-0">
              {/* Month label row */}
              <div className="h-4 text-[9px] text-text-muted leading-4 w-[10px] whitespace-nowrap">
                {monthLabel ? monthLabel.label : ""}
              </div>
              {week.map((day, di) => {
                if (!day) {
                  return <div key={di} className="h-[10px] w-[10px] rounded-sm" />;
                }
                const intensity = getIntensity(day.wordsWritten);
                return (
                  <div
                    key={di}
                    className={`h-[10px] w-[10px] rounded-sm transition-colors ${intensityClass(intensity)}`}
                    title={`${day.date}: ${day.wordsWritten.toLocaleString()} words`}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
