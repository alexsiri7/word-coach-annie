"use client";

import { useState, useCallback } from "react";
import { Users, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Local copies of the API types from peer-review/route.ts — kept in sync manually.
// TODO: extract to src/types/peer-review.ts to avoid duplication.
interface ReviewFeedback {
  overallImpression: string;
  strengths: string[];
  weaknesses: string[];
  detailedFeedback: string;
  recommendation: string;
}

interface ConsensusFeedback {
  pointsOfAgreement: string[];
  pointsOfDisagreement: string[];
  topPriorities: string[];
  synthesizedRecommendation: string;
}

interface PeerReviewResult {
  publisher: ReviewFeedback;
  reader: ReviewFeedback;
  writer: ReviewFeedback;
  consensus: ConsensusFeedback;
  warning?: string;
}

interface PeerReviewPanelProps {
  projectId: string;
  onClose: () => void;
}

type TabKey = "publisher" | "reader" | "writer" | "consensus";

const TABS: { key: TabKey; label: string }[] = [
  { key: "publisher", label: "Publisher" },
  { key: "reader", label: "Reader" },
  { key: "writer", label: "Writer" },
  { key: "consensus", label: "Consensus" },
];

export function PeerReviewPanel({ projectId, onClose }: PeerReviewPanelProps) {
  const [review, setReview] = useState<PeerReviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("publisher");
  const [error, setError] = useState<string | null>(null);

  const runReview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/peer-review`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.warning) {
          setError(data.warning);
        } else {
          setReview(data);
        }
      } else {
        setError(`Request failed (${res.status})`);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
      setRan(true);
    }
  }, [projectId]);

  const renderReviewTab = (feedback: ReviewFeedback) => (
    <div className="space-y-3">
      <div>
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Overall Impression</h4>
        <p className="text-sm text-foreground">{feedback.overallImpression}</p>
      </div>
      {feedback.strengths.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Strengths</h4>
          <ul className="list-disc list-inside space-y-0.5">
            {feedback.strengths.map((s, i) => (
              <li key={i} className="text-sm text-foreground">{s}</li>
            ))}
          </ul>
        </div>
      )}
      {feedback.weaknesses.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Weaknesses</h4>
          <ul className="list-disc list-inside space-y-0.5">
            {feedback.weaknesses.map((w, i) => (
              <li key={i} className="text-sm text-foreground">{w}</li>
            ))}
          </ul>
        </div>
      )}
      {feedback.detailedFeedback && (
        <div>
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Detailed Feedback</h4>
          <p className="text-sm text-foreground whitespace-pre-wrap">{feedback.detailedFeedback}</p>
        </div>
      )}
      <div>
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Recommendation</h4>
        <span className="text-xs font-semibold px-2 py-1 rounded bg-accent/10 text-accent">{feedback.recommendation}</span>
      </div>
    </div>
  );

  const renderConsensusTab = (consensus: ConsensusFeedback) => (
    <div className="space-y-3">
      {consensus.pointsOfAgreement.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Points of Agreement</h4>
          <ul className="list-disc list-inside space-y-0.5">
            {consensus.pointsOfAgreement.map((p, i) => (
              <li key={i} className="text-sm text-foreground">{p}</li>
            ))}
          </ul>
        </div>
      )}
      {consensus.pointsOfDisagreement.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Points of Disagreement</h4>
          <ul className="list-disc list-inside space-y-0.5">
            {consensus.pointsOfDisagreement.map((p, i) => (
              <li key={i} className="text-sm text-foreground">{p}</li>
            ))}
          </ul>
        </div>
      )}
      {consensus.topPriorities.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Top Priorities</h4>
          <ol className="list-decimal list-inside space-y-0.5">
            {consensus.topPriorities.map((p, i) => (
              <li key={i} className="text-sm text-foreground">{p}</li>
            ))}
          </ol>
        </div>
      )}
      {consensus.synthesizedRecommendation && (
        <div>
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Synthesized Recommendation</h4>
          <p className="text-sm text-foreground whitespace-pre-wrap">{consensus.synthesizedRecommendation}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full max-h-[400px] overflow-hidden rounded-lg border border-border bg-background shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20 shrink-0">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-accent" />
          <span className="text-sm font-medium">Peer Review</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={runReview}
            disabled={loading}
            aria-label="Run peer review"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      {review && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border shrink-0">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                activeTab === key
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!ran && !loading && (
          <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Get feedback from three AI reviewers: a Publisher, an Avid Reader, and an Experienced Writer.
            </p>
            <Button size="sm" onClick={runReview}>
              Run Peer Review
            </Button>
          </div>
        )}

        {loading && (
          <div className="p-4 flex items-center justify-center gap-2">
            <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">Analysing manuscript…</span>
          </div>
        )}

        {ran && !loading && !review && (
          <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground">
              {error ?? "No review results available."}
            </p>
          </div>
        )}

        {review && !loading && (
          <div className="p-3">
            {activeTab === "consensus"
              ? renderConsensusTab(review.consensus)
              : renderReviewTab(review[activeTab])}
          </div>
        )}
      </div>
    </div>
  );
}
