"use client";

import { useState } from "react";
import {
  GitBranch,
  Users,
  CheckSquare,
  Loader2,
  X,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sanitizeMessageContent } from "@/lib/sanitize";
import { cn } from "@/lib/utils";
import type { ManuscriptAnalysisType } from "@/app/api/ai-manuscript/route";

interface AnalysisDef {
  id: ManuscriptAnalysisType;
  label: string;
  icon: React.ElementType;
  description: string;
}

const ANALYSES: AnalysisDef[] = [
  {
    id: "plot-threads",
    label: "Plot thread tracker",
    icon: GitBranch,
    description: "Which threads are active, dormant, or need payoff",
  },
  {
    id: "character-arcs",
    label: "Character arc summary",
    icon: Users,
    description: "Where each character is in their arc",
  },
  {
    id: "consistency-check",
    label: "Consistency check",
    icon: CheckSquare,
    description: "Contradictions in descriptions, timeline, and world",
  },
];

interface ManuscriptAiPanelProps {
  projectId: string;
  onClose: () => void;
}

export function ManuscriptAiPanel({ projectId, onClose }: ManuscriptAiPanelProps) {
  const [loading, setLoading] = useState<ManuscriptAnalysisType | null>(null);
  const [result, setResult] = useState<{ type: ManuscriptAnalysisType; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async (analysisType: ManuscriptAnalysisType) => {
    setLoading(analysisType);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/ai-manuscript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, analysisType }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Something went wrong");
        return;
      }

      const data = await res.json();
      setResult({ type: analysisType, content: data.result });
    } catch {
      setError("Could not connect to AI service");
    } finally {
      setLoading(null);
    }
  };

  const currentAnalysis = result ? ANALYSES.find((a) => a.id === result.type) : null;

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-accent" />
          <span className="text-sm font-medium text-text-primary">Manuscript Analysis</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-text-muted hover:text-text-primary"
          onClick={onClose}
          aria-label="Close manuscript AI panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Analysis buttons */}
      <div className="px-4 py-3 border-b border-border space-y-2">
        <p className="text-xs text-text-muted mb-3">Run a full-manuscript analysis to get a structured report.</p>
        {ANALYSES.map((analysis) => {
          const Icon = analysis.icon;
          const isLoading = loading === analysis.id;
          return (
            <button
              key={analysis.id}
              disabled={loading !== null}
              onClick={() => runAnalysis(analysis.id)}
              className={cn(
                "w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors",
                "border-border bg-surface-raised hover:bg-surface-overlay hover:border-accent/30",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                result?.type === analysis.id && "border-accent/40 bg-accent/5"
              )}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-accent animate-spin" />
              ) : (
                <Icon className="h-4 w-4 mt-0.5 flex-shrink-0 text-text-muted" />
              )}
              <div>
                <p className="text-sm font-medium text-text-primary leading-tight">{analysis.label}</p>
                <p className="text-xs text-text-muted mt-0.5">{analysis.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Result */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-4 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-xs text-danger">
            {error}
          </div>
        )}

        {loading && !result && (
          <div className="flex flex-col items-center justify-center h-32 gap-3 text-text-muted">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
            <p className="text-xs">Analyzing your manuscript…</p>
          </div>
        )}

        {result && currentAnalysis && (
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-3">
              <currentAnalysis.icon className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs font-medium text-accent uppercase tracking-wide">
                {currentAnalysis.label}
              </span>
            </div>
            <div className="prose-chat text-sm text-text-secondary [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_strong]:text-text-primary [&_ul]:space-y-0.5 [&_li]:text-xs [&_p]:leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {sanitizeMessageContent(result.content)}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
