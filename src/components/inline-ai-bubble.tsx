"use client";

import { useState, useRef, useCallback } from "react";
import { Wand2, ChevronRight, Zap, Eye, Type, Play, Maximize2, Mic, MessageCircle, X, RotateCcw, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type InlineAction =
  | "tighten"
  | "vivid"
  | "simpler"
  | "continue"
  | "expand"
  | "voice-check"
  | "custom";

interface InlineAIBubbleProps {
  projectId: string;
  sceneId: string;
  selectedText: string;
  onAccept: (result: string) => void;
  onDismiss: () => void;
}

const ACTIONS: { id: InlineAction; label: string; icon: typeof Wand2; group: "rewrite" | "generate" | "analyze" }[] = [
  { id: "tighten", label: "Tighten", icon: Zap, group: "rewrite" },
  { id: "vivid", label: "Vivid", icon: Eye, group: "rewrite" },
  { id: "simpler", label: "Simpler", icon: Type, group: "rewrite" },
  { id: "continue", label: "Continue", icon: Play, group: "generate" },
  { id: "expand", label: "Expand", icon: Maximize2, group: "generate" },
  { id: "voice-check", label: "Voice check", icon: Mic, group: "analyze" },
  { id: "custom", label: "Ask Annie", icon: MessageCircle, group: "analyze" },
];

export function InlineAIBubble({ projectId, sceneId, selectedText, onAccept, onDismiss }: InlineAIBubbleProps) {
  const [phase, setPhase] = useState<"actions" | "custom-input" | "streaming" | "result">("actions");
  const [customInput, setCustomInput] = useState("");
  const [result, setResult] = useState("");
  const [activeAction, setActiveAction] = useState<InlineAction | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runAction = useCallback(async (action: InlineAction, customInstruction?: string) => {
    setActiveAction(action);
    setPhase("streaming");
    setResult("");

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/ai-inline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          sceneId,
          action,
          selectedText,
          customInstruction,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "content") {
                accumulated += parsed.content;
                setResult(accumulated);
              }
            } catch {
              // skip malformed
            }
          }
        }
      }
      setPhase("result");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setResult("Sorry, something went wrong. Please try again.");
      setPhase("result");
    }
  }, [projectId, sceneId, selectedText]);

  const handleActionClick = (action: InlineAction) => {
    if (action === "custom") {
      setPhase("custom-input");
    } else {
      runAction(action);
    }
  };

  const handleCustomSubmit = () => {
    if (!customInput.trim()) return;
    runAction("custom", customInput.trim());
  };

  const handleRetry = () => {
    if (!activeAction) return;
    if (activeAction === "custom") {
      runAction("custom", customInput.trim());
    } else {
      runAction(activeAction);
    }
  };

  const handleAccept = () => {
    // Only replace for rewrite/generate actions; voice-check is just feedback
    if (activeAction === "voice-check" || activeAction === "custom") {
      onDismiss();
    } else {
      onAccept(result);
    }
  };

  const isReplaceAction = activeAction && activeAction !== "voice-check";

  if (phase === "actions") {
    return (
      <div className="flex items-center gap-1 p-1 bg-surface-raised border border-border rounded-lg shadow-lg flex-wrap">
        <Wand2 className="h-3 w-3 text-accent ml-1 flex-shrink-0" />
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            onClick={() => handleActionClick(action.id)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-secondary hover:bg-accent/10 hover:text-accent transition-colors whitespace-nowrap"
            title={action.label}
          >
            <action.icon className="h-3 w-3 flex-shrink-0" />
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    );
  }

  if (phase === "custom-input") {
    return (
      <div className="flex flex-col gap-2 p-2 bg-surface-raised border border-border rounded-lg shadow-lg w-72">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-secondary">Ask Annie</span>
          <Button variant="ghost" size="icon" className="h-5 w-5 text-text-muted" onClick={onDismiss}>
            <X className="h-3 w-3" />
          </Button>
        </div>
        <Textarea
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          placeholder="What would you like Annie to do with this text?"
          className="text-xs min-h-[60px] resize-none"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleCustomSubmit();
          }}
        />
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onDismiss}>
            Cancel
          </Button>
          <Button size="sm" className="h-6 text-xs" onClick={handleCustomSubmit} disabled={!customInput.trim()}>
            <ChevronRight className="h-3 w-3" />
            Ask
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2 bg-surface-raised border border-border rounded-lg shadow-lg w-80 max-h-64">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary flex items-center gap-1">
          <Wand2 className="h-3 w-3 text-accent" />
          {ACTIONS.find((a) => a.id === activeAction)?.label}
        </span>
        {phase === "result" && (
          <Button variant="ghost" size="icon" className="h-5 w-5 text-text-muted" onClick={onDismiss}>
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div className={cn(
        "flex-1 overflow-y-auto text-xs text-text-secondary leading-relaxed whitespace-pre-wrap min-h-[60px]",
        phase === "streaming" && "text-text-muted"
      )}>
        {result || (phase === "streaming" && <Loader2 className="h-3 w-3 animate-spin text-accent" />)}
      </div>

      {phase === "result" && (
        <div className="flex items-center gap-1 pt-1 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1 text-text-muted hover:text-text-primary"
            onClick={handleRetry}
          >
            <RotateCcw className="h-3 w-3" />
            Try again
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
          <Button
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={handleAccept}
          >
            <Check className="h-3 w-3" />
            {isReplaceAction ? "Accept" : "Done"}
          </Button>
        </div>
      )}
    </div>
  );
}
