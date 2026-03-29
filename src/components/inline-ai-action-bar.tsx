"use client";

import { useState, useRef, useCallback } from "react";
import type { Editor } from "@tiptap/react";
import {
  Sparkles,
  AlignLeft,
  ChevronDown,
  FastForward,
  ExpandIcon,
  MessageSquare,
  Check,
  RefreshCw,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { InlineAiAction } from "@/app/api/ai-inline/route";

interface InlineAiActionBarProps {
  editor: Editor;
  sceneContext?: string;
}

interface ActionDef {
  id: InlineAiAction;
  label: string;
  icon: React.ElementType;
  sub?: { id: InlineAiAction; label: string }[];
}

const ACTIONS: ActionDef[] = [
  {
    id: "rewrite-tighter",
    label: "Rewrite",
    icon: Sparkles,
    sub: [
      { id: "rewrite-tighter", label: "Tighter" },
      { id: "rewrite-vivid", label: "More vivid" },
      { id: "rewrite-simpler", label: "Simpler" },
    ],
  },
  { id: "continue", label: "Continue", icon: FastForward },
  { id: "expand", label: "Expand", icon: ExpandIcon },
  { id: "voice-check", label: "Voice check", icon: AlignLeft },
  { id: "ask", label: "Ask Annie", icon: MessageSquare },
];

type PanelState =
  | { kind: "idle" }
  | { kind: "ask-input" }
  | { kind: "rewrite-menu" }
  | { kind: "loading"; action: InlineAiAction }
  | { kind: "result"; action: InlineAiAction; result: string; originalText: string };

export function InlineAiActionBar({ editor, sceneContext }: InlineAiActionBarProps) {
  const [panel, setPanel] = useState<PanelState>({ kind: "idle" });
  const askInputRef = useRef<HTMLTextAreaElement>(null);

  const getSelectedText = useCallback((): string => {
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, " ");
  }, [editor]);

  const runAction = useCallback(
    async (action: InlineAiAction, askPrompt?: string) => {
      const selectedText = getSelectedText();
      if (!selectedText.trim()) return;

      setPanel({ kind: "loading", action });

      try {
        const res = await fetch("/api/ai-inline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedText,
            sceneContext,
            action,
            askPrompt,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setPanel({
            kind: "result",
            action,
            result: `Error: ${err.error || "Something went wrong"}`,
            originalText: selectedText,
          });
          return;
        }

        const { result } = await res.json();
        setPanel({ kind: "result", action, result, originalText: selectedText });
      } catch {
        setPanel({
          kind: "result",
          action,
          result: "Error: Could not connect to AI service",
          originalText: selectedText,
        });
      }
    },
    [editor, getSelectedText, sceneContext]
  );

  const handleAccept = useCallback(() => {
    if (panel.kind !== "result") return;
    const isAnalysis = panel.action === "voice-check" || panel.action === "ask";
    if (!isAnalysis) {
      // Replace selected text with result
      editor.chain().focus().insertContent(panel.result).run();
    }
    setPanel({ kind: "idle" });
  }, [editor, panel]);

  const handleTryAgain = useCallback(() => {
    if (panel.kind !== "result") return;
    runAction(panel.action);
  }, [panel, runAction]);

  const handleDismiss = useCallback(() => {
    setPanel({ kind: "idle" });
  }, []);

  const isAnalysis =
    panel.kind === "result" &&
    (panel.action === "voice-check" || panel.action === "ask");

  return (
    <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
      {/* Action buttons row */}
      {(panel.kind === "idle" || panel.kind === "ask-input" || panel.kind === "rewrite-menu") && (
        <div className="flex items-center gap-1 px-1 py-1 rounded-lg bg-surface-raised border border-border shadow-xl">
          {ACTIONS.map((action) => {
            const Icon = action.icon;

            if (action.id === "rewrite-tighter" && action.sub) {
              return (
                <div key={action.id} className="relative">
                  <Button
                    size="sm"
                    variant={panel.kind === "rewrite-menu" ? "secondary" : "ghost"}
                    className="h-7 px-2 text-xs gap-1 text-text-secondary hover:text-text-primary"
                    onClick={() =>
                      setPanel(panel.kind === "rewrite-menu" ? { kind: "idle" } : { kind: "rewrite-menu" })
                    }
                  >
                    <Icon className="h-3 w-3" />
                    {action.label}
                    <ChevronDown className="h-2.5 w-2.5" />
                  </Button>
                  {panel.kind === "rewrite-menu" && (
                    <div className="absolute top-full left-0 mt-1 flex flex-col gap-0.5 bg-surface-raised border border-border rounded-md shadow-xl z-50 min-w-[110px] py-1">
                      {action.sub.map((sub) => (
                        <button
                          key={sub.id}
                          className="px-3 py-1.5 text-xs text-left hover:bg-surface-overlay text-text-secondary hover:text-text-primary transition-colors"
                          onClick={() => {
                            setPanel({ kind: "idle" });
                            runAction(sub.id);
                          }}
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            if (action.id === "ask") {
              return (
                <Button
                  key={action.id}
                  size="sm"
                  variant={panel.kind === "ask-input" ? "secondary" : "ghost"}
                  className="h-7 px-2 text-xs gap-1 text-text-secondary hover:text-text-primary"
                  onClick={() =>
                    setPanel(panel.kind === "ask-input" ? { kind: "idle" } : { kind: "ask-input" })
                  }
                >
                  <Icon className="h-3 w-3" />
                  {action.label}
                </Button>
              );
            }

            return (
              <Button
                key={action.id}
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1 text-text-secondary hover:text-text-primary"
                onClick={() => runAction(action.id)}
              >
                <Icon className="h-3 w-3" />
                {action.label}
              </Button>
            );
          })}
        </div>
      )}

      {/* Ask Annie input */}
      {panel.kind === "ask-input" && (
        <div className="flex gap-1 px-1 pb-1">
          <Textarea
            ref={askInputRef}
            placeholder="Ask anything about this passage…"
            className="text-xs min-h-[56px] resize-none bg-surface-raised border-border"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const val = askInputRef.current?.value.trim();
                if (val) runAction("ask", val);
              }
              if (e.key === "Escape") setPanel({ kind: "idle" });
            }}
          />
          <Button
            size="sm"
            className="h-7 self-end px-2 text-xs"
            onClick={() => {
              const val = askInputRef.current?.value.trim();
              if (val) runAction("ask", val);
            }}
          >
            Ask
          </Button>
        </div>
      )}

      {/* Loading state */}
      {panel.kind === "loading" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-raised border border-border shadow-xl text-xs text-text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
          <span>Annie is thinking…</span>
        </div>
      )}

      {/* Result panel */}
      {panel.kind === "result" && (
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-surface-raised border border-border shadow-xl max-w-sm">
          <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
            {panel.result}
          </p>
          <div className="flex items-center gap-1.5">
            {!isAnalysis && (
              <Button
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={handleAccept}
              >
                <Check className="h-3 w-3" />
                Accept
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs gap-1"
              onClick={handleTryAgain}
            >
              <RefreshCw className="h-3 w-3" />
              Try again
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs gap-1 ml-auto"
              onClick={handleDismiss}
            >
              <X className="h-3 w-3" />
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
