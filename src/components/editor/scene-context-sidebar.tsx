"use client";

import { useState, useEffect, useCallback } from "react";
import {
  User,
  MapPin,
  Sparkles,
  ChevronRight,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SceneCharacter {
  id: string;
  name: string;
  role?: string | null;
}

interface SceneLocation {
  id: string;
  name: string;
  description?: string | null;
}

interface NarrativeBeat {
  id: string;
  label: string;
  completed: boolean;
}

interface SceneContextSidebarProps {
  projectId: string;
  sceneId: string;
  sceneTitle?: string;
  wordCount: number;
  updatedAt?: string;
  visible: boolean;
}

export function SceneContextSidebar({
  projectId: _projectId,
  sceneId,
  sceneTitle: _sceneTitle,
  wordCount,
  updatedAt,
  visible,
}: SceneContextSidebarProps) {
  const [characters, setCharacters] = useState<SceneCharacter[]>([]);
  const [locations, setLocations] = useState<SceneLocation[]>([]);
  const [beats] = useState<NarrativeBeat[]>([]);
  const [advice] = useState<string | null>(null);

  const fetchRelated = useCallback(async () => {
    try {
      const res = await fetch(`/api/focus/${sceneId}`);
      if (!res.ok) return;
      const data = await res.json();

      // Extract characters and locations from related elements
      const related = data.related || {};
      if (related.CHARACTER) {
        setCharacters(
          related.CHARACTER.map((c: { id: string; name: string; role?: string }) => ({
            id: c.id,
            name: c.name,
            role: c.role,
          }))
        );
      }
      if (related.LOCATION) {
        setLocations(
          related.LOCATION.map((l: { id: string; name: string; description?: string }) => ({
            id: l.id,
            name: l.name,
            description: l.description,
          }))
        );
      }
    } catch {
      // best-effort
    }
  }, [sceneId]);

  useEffect(() => {
    if (visible) {
      fetchRelated();
    }
  }, [visible, fetchRelated]);

  const completedBeats = beats.filter((b) => b.completed).length;
  const revisedDate = updatedAt
    ? new Date(updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  if (!visible) return null;

  return (
    <aside className="w-[320px] shrink-0 border-l border-border/50 bg-surface-overlay overflow-y-auto animate-slide-in-right">
      <div className="p-6 space-y-8">
        {/* In This Scene */}
        <section>
          <header className="flex items-center justify-between mb-4">
            <h3 className="label-md text-text-muted font-bold">
              In This Scene
            </h3>
            <MoreHorizontal className="h-3.5 w-3.5 text-text-muted" />
          </header>

          <div className="space-y-4">
            {/* Characters */}
            {characters.length > 0 && (
              <div className="space-y-3">
                {characters.map((char) => (
                  <div
                    key={char.id}
                    className="flex items-center gap-3 group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-surface-raised flex items-center justify-center text-text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-200">
                      <User className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-text-primary">
                        {char.name}
                      </h4>
                      {char.role && (
                        <p className="text-[11px] text-text-muted">
                          {char.role}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Locations */}
            {locations.length > 0 && (
              <div
                className={cn(
                  "space-y-3",
                  characters.length > 0 && "pt-3 border-t border-border/30"
                )}
              >
                {locations.map((loc) => (
                  <div
                    key={loc.id}
                    className="flex items-center gap-3 group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-surface-raised flex items-center justify-center text-text-primary group-hover:bg-accent group-hover:text-accent-foreground transition-colors duration-200">
                      <MapPin className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-text-primary">
                        {loc.name}
                      </h4>
                      {loc.description && (
                        <p className="text-[11px] text-text-muted line-clamp-1">
                          {loc.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {characters.length === 0 && locations.length === 0 && (
              <p className="text-xs text-text-muted italic">
                No elements linked to this scene yet.
              </p>
            )}
          </div>
        </section>

        {/* Annie's Advice */}
        <section className="glass-card p-5 relative overflow-hidden">
          <div className="absolute top-3 right-3">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
          </div>
          <h3 className="label-md text-accent font-bold mb-3">
            Annie&apos;s Advice
          </h3>
          <div className="space-y-3">
            {advice ? (
              <p className="font-editorial text-sm italic text-text-primary leading-snug">
                &ldquo;{advice}&rdquo;
              </p>
            ) : (
              <p className="font-editorial text-sm italic text-text-muted leading-snug">
                &ldquo;Keep writing, I&apos;ll share thoughts as your scene develops...&rdquo;
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <button className="flex items-center justify-between p-2 text-[11px] text-text-primary bg-surface hover:bg-surface-raised transition-colors border-b border-border/30 group">
                <span>Need a plot twist?</span>
                <ChevronRight className="h-3 w-3 text-text-muted group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button className="flex items-center justify-between p-2 text-[11px] text-text-primary bg-surface hover:bg-surface-raised transition-colors border-b border-border/30 group">
                <span>How about a character conflict?</span>
                <ChevronRight className="h-3 w-3 text-text-muted group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>
        </section>

        {/* Narrative Beats */}
        {beats.length > 0 && (
          <section>
            <header className="flex items-center justify-between mb-4">
              <h3 className="label-md text-text-muted font-bold">
                Narrative Beats
              </h3>
              <span className="text-[10px] font-bold text-accent">
                {completedBeats}/{beats.length} Done
              </span>
            </header>
            <div className="space-y-2">
              {beats.map((beat) => (
                <label
                  key={beat.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded border cursor-pointer transition-all",
                    beat.completed
                      ? "bg-surface-raised/50 border-border/30"
                      : "bg-surface-raised border-border hover:shadow-sm"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={beat.completed}
                    readOnly
                    className="rounded-sm border-text-muted text-accent focus:ring-0 focus:ring-offset-0"
                  />
                  <span
                    className={cn(
                      "text-sm font-medium",
                      beat.completed
                        ? "text-text-muted line-through"
                        : "text-text-primary"
                    )}
                  >
                    {beat.label}
                  </span>
                </label>
              ))}
            </div>
          </section>
        )}

        {/* Scene Metadata */}
        <section className="flex gap-3">
          <span className="stamp-chip">
            {wordCount.toLocaleString()} Words
          </span>
          {revisedDate && (
            <span className="stamp-chip">
              Revised {revisedDate}
            </span>
          )}
        </section>
      </div>
    </aside>
  );
}
