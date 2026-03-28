"use client";

import { useState, useCallback } from "react";
import { BookOpen, X, Loader2, RotateCcw, GitBranch, User, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { sanitizeMessageContent } from "@/lib/sanitize";

type ManuscriptAction = "plot-threads" | "character-arcs" | "consistency-check";

const MANUSCRIPT_ACTIONS: {
  id: ManuscriptAction;
  label: string;
  description: string;
  icon: typeof GitBranch;
  prompt: string;
}[] = [
  {
    id: "plot-threads",
    label: "Plot thread tracker",
    description: "Which threads are active, dormant, or unresolved?",
    icon: GitBranch,
    prompt: "Analyze the manuscript's plot threads. For each thread: name it, note which scenes it appears in (using scene titles and status), identify if it's active, dormant, or resolved, and flag any that seem abandoned. Present as a structured report.",
  },
  {
    id: "character-arcs",
    label: "Character arc summary",
    description: "Where is each character in their development arc?",
    icon: User,
    prompt: "Summarize the character development arcs across the manuscript. For each major character: describe where their arc is currently, which scenes show key development moments, and what remains unresolved. Note any flat arcs or missed opportunities.",
  },
  {
    id: "consistency-check",
    label: "Consistency check",
    description: "Contradictions in descriptions, timeline, or world",
    icon: Search,
    prompt: "Review the manuscript for inconsistencies. Check: character descriptions and traits, timeline and chronology, world-building details, location descriptions, and continuity across scenes. Report any contradictions or inconsistencies found.",
  },
];

interface ManuscriptAIPanelProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
}

export function ManuscriptAIPanel({ projectId, open, onClose }: ManuscriptAIPanelProps) {
  const [activeAction, setActiveAction] = useState<ManuscriptAction | null>(null);
  const [phase, setPhase] = useState<"menu" | "loading" | "result">("menu");
  const [result, setResult] = useState("");

  const runAction = useCallback(async (action: ManuscriptAction) => {
    const actionDef = MANUSCRIPT_ACTIONS.find((a) => a.id === action);
    if (!actionDef) return;

    setActiveAction(action);
    setPhase("loading");
    setResult("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          message: actionDef.prompt,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let accumulated = "";

      setPhase("result");

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
    } catch {
      setResult("Sorry, something went wrong. Please try again.");
      setPhase("result");
    }
  }, [projectId]);

  const handleBack = () => {
    setPhase("menu");
    setActiveAction(null);
    setResult("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-sm font-medium">
              <BookOpen className="h-4 w-4 text-accent" />
              Manuscript Analysis
            </DialogTitle>
            {phase !== "menu" && (
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleBack}>
                ← Back
              </Button>
            )}
          </div>
        </DialogHeader>

        {phase === "menu" && (
          <div className="p-4 space-y-2">
            <p className="text-xs text-text-muted mb-3">
              Manuscript-level analysis across all scenes. Results appear as a structured report.
            </p>
            {MANUSCRIPT_ACTIONS.map((action) => (
              <button
                key={action.id}
                onClick={() => runAction(action.id)}
                className="w-full text-left p-3 rounded-lg border border-border bg-surface hover:bg-surface-overlay hover:border-accent/30 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <action.icon className="h-4 w-4 text-text-muted group-hover:text-accent mt-0.5 flex-shrink-0 transition-colors" />
                  <div>
                    <div className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors">
                      {action.label}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">{action.description}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {phase === "loading" && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="flex flex-col items-center gap-3 text-text-muted">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
              <span className="text-sm">Analyzing manuscript...</span>
            </div>
          </div>
        )}

        {phase === "result" && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-2 border-b border-border bg-surface-raised flex items-center gap-2 flex-shrink-0">
              {activeAction && (() => {
                const action = MANUSCRIPT_ACTIONS.find((a) => a.id === activeAction);
                if (!action) return null;
                return (
                  <>
                    <action.icon className="h-3.5 w-3.5 text-accent" />
                    <span className="text-xs font-medium text-text-secondary">{action.label}</span>
                  </>
                );
              })()}
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1"
                onClick={() => activeAction && runAction(activeAction)}
              >
                <RotateCcw className="h-3 w-3" />
                Re-run
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="prose-chat text-sm">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h2: ({ children }) => <h2 className="font-semibold text-sm mt-4 mb-2 first:mt-0">{children}</h2>,
                    h3: ({ children }) => <h3 className="font-medium text-sm mt-3 mb-1">{children}</h3>,
                    ul: ({ children }) => <ul className="space-y-1 my-2">{children}</ul>,
                    li: ({ children }) => <li className="text-sm flex gap-1.5"><span className="text-accent flex-shrink-0">•</span><span>{children}</span></li>,
                    p: ({ children }) => <p className="text-sm mb-2 text-text-secondary">{children}</p>,
                    strong: ({ children }) => <strong className="font-medium text-text-primary">{children}</strong>,
                  }}
                >
                  {sanitizeMessageContent(result)}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
