"use client";

import { useState, useCallback } from "react";
import { Mic, X, RefreshCw, Users, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StoryObject } from "@/lib/types";

interface VoiceProfile {
  characterId: string;
  characterName: string;
  traits: string[];
  summary: string;
}

interface VoiceFeedback {
  characterId: string;
  characterName: string;
  issue: string;
  suggestedVoice: string;
  selectedText: string;
}

interface VoiceMonitorPanelProps {
  projectId: string;
  sceneId: string;
  linkedCharacters: StoryObject[];
  selectedText?: string;
  onClose: () => void;
}

/**
 * VoiceMonitorPanel — shows character voice profiles and optional voice-consistency
 * feedback for selected dialogue text.
 */
export function VoiceMonitorPanel({
  projectId,
  sceneId,
  linkedCharacters,
  selectedText,
  onClose,
}: VoiceMonitorPanelProps) {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [feedback, setFeedback] = useState<VoiceFeedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const runVoiceCheck = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/voice-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId,
          selectedText: selectedText || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles ?? []);
        setFeedback(data.feedback ?? []);
      }
    } finally {
      setLoading(false);
      setRan(true);
    }
  }, [projectId, sceneId, selectedText]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full max-h-[400px] overflow-hidden rounded-lg border border-border bg-background shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20 shrink-0">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-medium">Voice Monitor</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={runVoiceCheck}
            disabled={loading}
            aria-label="Analyze voice consistency"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Character list from outline */}
        {linkedCharacters.length > 0 && (
          <div className="p-3 border-b border-border/50">
            <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-2">
              Characters in this scene
            </p>
            <div className="flex flex-wrap gap-1.5">
              {linkedCharacters.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1 text-xs bg-muted/50 border border-border/50 rounded-full px-2 py-0.5"
                >
                  <Users className="h-3 w-3 text-muted-foreground" />
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {!ran && !loading && (
          <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              {selectedText
                ? "Analyze selected dialogue for voice consistency."
                : "Analyze this scene for character voice consistency."}
            </p>
            <Button size="sm" onClick={runVoiceCheck}>
              Analyze Voice
            </Button>
          </div>
        )}

        {loading && (
          <div className="p-4 flex items-center justify-center gap-2">
            <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">Analyzing voice…</span>
          </div>
        )}

        {/* Voice feedback on selected text */}
        {ran && !loading && feedback.length > 0 && (
          <div className="border-b border-border/50">
            <div className="px-3 py-2">
              <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-2">
                Voice Feedback
              </p>
            </div>
            <ul className="divide-y divide-border/50">
              {feedback.map((fb, i) => {
                const key = `fb-${i}`;
                const isOpen = expanded.has(key);
                return (
                  <li key={key}>
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-muted/30 flex items-start gap-2"
                      onClick={() => toggleExpand(key)}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      )}
                      <div>
                        <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                          {fb.characterName}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{fb.issue}</p>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 pt-1 ml-6 space-y-2">
                        {fb.selectedText && (
                          <blockquote className="text-xs italic text-muted-foreground border-l-2 border-border pl-2">
                            "{fb.selectedText.slice(0, 200)}"
                          </blockquote>
                        )}
                        <p className="text-xs text-foreground">{fb.issue}</p>
                        {fb.suggestedVoice && (
                          <div className="bg-muted/30 rounded p-2">
                            <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-1">
                              {fb.characterName}&apos;s established voice
                            </p>
                            <p className="text-xs">{fb.suggestedVoice}</p>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
                            Keep as-is
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Character voice profiles */}
        {ran && !loading && profiles.length > 0 && (
          <div>
            <div className="px-3 py-2">
              <p className="text-[10px] uppercase text-muted-foreground font-semibold">
                Voice Profiles
              </p>
            </div>
            <ul className="divide-y divide-border/50">
              {profiles.map((profile) => {
                const isOpen = expanded.has(profile.characterId);
                return (
                  <li key={profile.characterId}>
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-muted/30 flex items-center gap-2"
                      onClick={() => toggleExpand(profile.characterId)}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">{profile.characterName}</span>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 pt-1 ml-6 space-y-2">
                        <p className="text-xs text-muted-foreground">{profile.summary}</p>
                        {profile.traits.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {profile.traits.map((trait) => (
                              <span
                                key={trait}
                                className="text-[10px] bg-muted/50 border border-border/50 rounded px-1.5 py-0.5"
                              >
                                {trait}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {ran && !loading && feedback.length === 0 && profiles.length === 0 && (
          <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground">No voice issues detected.</p>
          </div>
        )}
      </div>
    </div>
  );
}
