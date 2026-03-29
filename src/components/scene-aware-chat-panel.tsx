"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIChatPanel } from "@/components/ai-chat-panel";
import type { SceneStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ContextualPrompt {
  label: string;
  prompt: string;
}

const PROMPTS_BY_STATUS: Record<SceneStatus, ContextualPrompt[]> = {
  OUTLINE: [
    { label: "Draft from beats", prompt: "Draft this scene from the outline beats. Write a full first draft that expands each beat into prose." },
    { label: "Suggest opening line", prompt: "Suggest 3 strong opening lines for this scene that would hook the reader." },
    { label: "Expand beat outline", prompt: "Take the beat outline and expand each beat with more detail: what happens, the emotional undercurrent, and key dialogue or action." },
  ],
  DRAFT: [
    { label: "What's working?", prompt: "What's working well in this draft? Give me specific, honest feedback on the strongest elements." },
    { label: "Pacing check", prompt: "Analyze the pacing of this scene. Where does it drag? Where does it rush? What would improve the rhythm?" },
    { label: "Character voice audit", prompt: "Audit the character voices in this scene. Do they sound distinct from each other? Are any voices inconsistent with how they speak elsewhere?" },
    { label: "Continue", prompt: "Continue the scene from where it ends. Match the voice, pacing, and momentum of what's already there." },
    { label: "Suggest ending", prompt: "Suggest 3 different ways to end this scene, with different emotional tones (resolved, unresolved, cliffhanger)." },
  ],
  REVISED: [
    { label: "Developmental edit", prompt: "Give me a developmental edit of this scene. Focus on structure, character motivation, and story function. What should stay, go, or change?" },
    { label: "Line edit", prompt: "Line edit this scene for clarity, flow, and word choice. Flag the weakest sentences and suggest improvements." },
    { label: "Consistency check", prompt: "Check this scene for internal consistency: character behavior, timeline, continuity with the rest of the story. Flag any issues." },
  ],
  FINAL: [
    { label: "Developmental edit", prompt: "Give me a final developmental edit. What's the last thing to fix before this scene is done?" },
    { label: "Line edit", prompt: "Final line edit: catch any remaining awkward phrasing, weak word choices, or unclear sentences." },
    { label: "Consistency check", prompt: "Final consistency check: timeline, character details, world facts. Anything that could contradict the rest of the manuscript?" },
  ],
};

const STATUS_LABELS: Record<SceneStatus, string> = {
  OUTLINE: "Outline",
  DRAFT: "Draft",
  REVISED: "Revised",
  FINAL: "Final",
};

interface SceneAwareChatPanelProps {
  projectId: string;
  sceneId?: string;
  sceneStatus?: SceneStatus;
  sceneTitle?: string;
  sceneContext?: string;
}

export function SceneAwareChatPanel({
  projectId,
  sceneStatus,
  sceneTitle,
  sceneContext,
}: SceneAwareChatPanelProps) {
  const [injectedPrompt, setInjectedPrompt] = useState<string | undefined>();
  const [chatKey, setChatKey] = useState(0);

  const prompts = sceneStatus ? PROMPTS_BY_STATUS[sceneStatus] : null;

  const handlePromptClick = (prompt: string) => {
    // Prepend scene context to the prompt
    const fullPrompt = sceneTitle
      ? `[Scene: ${sceneTitle}] ${prompt}`
      : prompt;
    setInjectedPrompt(fullPrompt);
    setChatKey((k) => k + 1); // Force re-render to trigger send
  };

  return (
    <div className="flex flex-col h-full">
      {/* Contextual prompt suggestions */}
      {prompts && prompts.length > 0 && (
        <div className="shrink-0 border-b border-border bg-surface-sunken/40 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3 w-3 text-accent" />
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
              {sceneTitle ? `${sceneTitle} — ` : ""}
              {sceneStatus ? STATUS_LABELS[sceneStatus] : "Scene"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {prompts.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant="outline"
                className={cn(
                  "h-6 px-2 text-xs rounded-full border-border/60 text-text-secondary",
                  "hover:bg-accent/10 hover:border-accent/40 hover:text-accent transition-colors"
                )}
                onClick={() => handlePromptClick(p.prompt)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Chat */}
      <div className="flex-1 min-h-0">
        <AIChatPanel
          key={chatKey}
          projectId={projectId}
          sceneContext={sceneContext}
          initialMessage={injectedPrompt}
          onPromptConsumed={() => setInjectedPrompt(undefined)}
        />
      </div>
    </div>
  );
}
