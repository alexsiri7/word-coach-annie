"use client";

import { useState, useCallback, useEffect } from "react";
import { Users, RefreshCw, MessageSquare, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { timeAgo } from "./editor-config";

// Local copies of the API types from peer-review/route.ts — kept in sync manually.
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

interface HistoryRow {
  id: string;
  createdAt: string;
  synthesizedRecommendation: string;
}

interface PeerReviewPanelProps {
  projectId: string;
  onStartChat: (message: string) => void;
}

type TabKey = "publisher" | "reader" | "writer" | "consensus";

const TABS: { key: TabKey; label: string }[] = [
  { key: "publisher", label: "Publisher" },
  { key: "reader", label: "Reader" },
  { key: "writer", label: "Writer" },
  { key: "consensus", label: "Consensus" },
];

const SECTION_HEADING = "text-xs font-semibold text-text-muted uppercase tracking-wider mb-1";

export function PeerReviewPanel({ projectId, onStartChat }: PeerReviewPanelProps) {
  const [review, setReview] = useState<PeerReviewResult | null>(null);
  const [currentMeta, setCurrentMeta] = useState<Pick<HistoryRow, "id" | "createdAt"> | null>(null);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("publisher");
  const [error, setError] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const applyReviewDetail = useCallback((detail: {
    id: string;
    createdAt: string;
    publisher: ReviewFeedback;
    reader: ReviewFeedback;
    writer: ReviewFeedback;
    consensus: ConsensusFeedback;
  }) => {
    setReview({
      publisher: detail.publisher,
      reader: detail.reader,
      writer: detail.writer,
      consensus: detail.consensus,
    });
    setCurrentMeta({ id: detail.id, createdAt: detail.createdAt });
    setRan(true);
  }, []);

  // Load latest saved review on mount / project change.
  // Does NOT show the spinner up front — the empty-state CTA renders until a saved review is found,
  // so brand-new projects don't briefly show "Analysing manuscript…" copy on mount.
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const listRes = await fetch(`/api/projects/${projectId}/peer-review?limit=1`);
        if (!listRes.ok) {
          console.warn("[PeerReviewPanel] mount list fetch failed", listRes.status);
          return;
        }
        const list = await listRes.json();
        const latestId = list?.data?.[0]?.id;
        if (!latestId) {
          if (!ignore) setRan(false);
          return;
        }
        if (!ignore) setLoading(true);
        const detailRes = await fetch(`/api/projects/${projectId}/peer-review/${latestId}`);
        if (!detailRes.ok) {
          console.warn("[PeerReviewPanel] mount detail fetch failed", detailRes.status);
          return;
        }
        const detail = await detailRes.json();
        if (ignore) return;
        applyReviewDetail(detail);
      } catch (e) {
        console.warn("[PeerReviewPanel] mount fetch threw", e);
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [projectId, applyReviewDetail]);

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
          if (data.id && data.createdAt) {
            setCurrentMeta({ id: data.id, createdAt: data.createdAt });
          }
          // Force history list to refetch on next open so the new review is visible.
          setHistory(null);
        }
      } else {
        let serverMsg: string | null = null;
        try {
          const body = await res.json();
          if (body && typeof body.error === "string") serverMsg = body.error;
        } catch {
          // non-JSON body; fall through to status-code message
        }
        setError(serverMsg ?? `Request failed (${res.status})`);
      }
    } catch (e) {
      console.warn("[PeerReviewPanel] runReview failed", e);
      setError("Network error — please try again");
    } finally {
      setLoading(false);
      setRan(true);
    }
  }, [projectId]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/peer-review?limit=20`);
      if (!res.ok) {
        setHistoryError(`Failed to load history (${res.status})`);
        return;
      }
      const data = await res.json();
      setHistory(data.data ?? []);
      setHistoryTotal(data.total ?? 0);
    } catch (e) {
      console.warn("[PeerReviewPanel] fetchHistory failed", e);
      setHistoryError("Network error — please try again");
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId]);

  const toggleHistory = useCallback(() => {
    setHistoryOpen((open) => {
      const next = !open;
      if (next && history === null) {
        void fetchHistory();
      }
      return next;
    });
  }, [history, fetchHistory]);

  const loadFromHistory = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/peer-review/${id}`);
      if (!res.ok) {
        setError(
          res.status === 404
            ? "Review no longer exists"
            : res.status === 403
              ? "You no longer have access to this review"
              : `Failed to load review (${res.status})`
        );
        return;
      }
      const detail = await res.json();
      applyReviewDetail(detail);
      setHistoryOpen(false);
      setActiveTab("publisher");
    } catch (e) {
      console.warn("[PeerReviewPanel] loadFromHistory failed", e);
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, [projectId, applyReviewDetail]);

  const renderReviewTab = (feedback: ReviewFeedback) => (
    <div className="space-y-3">
      <div>
        <h4 className={SECTION_HEADING}>Overall Impression</h4>
        <p className="text-sm text-foreground">{feedback.overallImpression}</p>
      </div>
      {feedback.strengths.length > 0 && (
        <div>
          <h4 className={SECTION_HEADING}>Strengths</h4>
          <ul className="list-disc list-inside space-y-0.5">
            {feedback.strengths.map((s, i) => (
              <li key={i} className="text-sm text-foreground">{s}</li>
            ))}
          </ul>
        </div>
      )}
      {feedback.weaknesses.length > 0 && (
        <div>
          <h4 className={SECTION_HEADING}>Weaknesses</h4>
          <ul className="list-disc list-inside space-y-0.5">
            {feedback.weaknesses.map((w, i) => (
              <li key={i} className="text-sm text-foreground">{w}</li>
            ))}
          </ul>
        </div>
      )}
      {feedback.detailedFeedback && (
        <div>
          <h4 className={SECTION_HEADING}>Detailed Feedback</h4>
          <p className="text-sm text-foreground whitespace-pre-wrap">{feedback.detailedFeedback}</p>
        </div>
      )}
      <div>
        <h4 className={SECTION_HEADING}>Recommendation</h4>
        <span className="text-xs font-semibold px-2 py-1 rounded bg-accent/10 text-accent">{feedback.recommendation}</span>
      </div>
      <div className="pt-2 border-t border-border mt-3">
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5"
          onClick={() => onStartChat(
            `I got feedback from a reviewer on my manuscript:\n\n` +
            `Overall: ${feedback.overallImpression}\n\n` +
            `Strengths:\n${feedback.strengths.map(s => `- ${s}`).join('\n')}\n\n` +
            `Weaknesses:\n${feedback.weaknesses.map(w => `- ${w}`).join('\n')}\n\n` +
            `Recommendation: ${feedback.recommendation}\n\n` +
            `Can you help me address the weaknesses?`
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Discuss with AI
        </Button>
      </div>
    </div>
  );

  const renderConsensusTab = (consensus: ConsensusFeedback) => (
    <div className="space-y-3">
      {consensus.pointsOfAgreement.length > 0 && (
        <div>
          <h4 className={SECTION_HEADING}>Points of Agreement</h4>
          <ul className="list-disc list-inside space-y-0.5">
            {consensus.pointsOfAgreement.map((p, i) => (
              <li key={i} className="text-sm text-foreground">{p}</li>
            ))}
          </ul>
        </div>
      )}
      {consensus.pointsOfDisagreement.length > 0 && (
        <div>
          <h4 className={SECTION_HEADING}>Points of Disagreement</h4>
          <ul className="list-disc list-inside space-y-0.5">
            {consensus.pointsOfDisagreement.map((p, i) => (
              <li key={i} className="text-sm text-foreground">{p}</li>
            ))}
          </ul>
        </div>
      )}
      {consensus.topPriorities.length > 0 && (
        <div>
          <h4 className={SECTION_HEADING}>Top Priorities</h4>
          <ol className="list-decimal list-inside space-y-0.5">
            {consensus.topPriorities.map((p, i) => (
              <li key={i} className="text-sm text-foreground">{p}</li>
            ))}
          </ol>
        </div>
      )}
      {consensus.synthesizedRecommendation && (
        <div>
          <h4 className={SECTION_HEADING}>Synthesized Recommendation</h4>
          <p className="text-sm text-foreground whitespace-pre-wrap">{consensus.synthesizedRecommendation}</p>
        </div>
      )}
      <div className="pt-2 border-t border-border mt-3">
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5"
          onClick={() => onStartChat(
            `I just got a peer review of my manuscript. Here's the consensus:\n\n` +
            `Points of agreement:\n${consensus.pointsOfAgreement.map(p => `- ${p}`).join('\n')}\n\n` +
            `Top priorities:\n${consensus.topPriorities.map(p => `- ${p}`).join('\n')}\n\n` +
            `Synthesized recommendation: ${consensus.synthesizedRecommendation}\n\n` +
            `Can you help me address these points?`
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Discuss with AI
        </Button>
      </div>
    </div>
  );

  const savedLabel = currentMeta ? `Saved ${timeAgo(currentMeta.createdAt)}` : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
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
            className={cn("h-7 w-7", historyOpen && "bg-accent/15 text-accent")}
            onClick={toggleHistory}
            aria-label="Toggle review history"
            aria-pressed={historyOpen}
          >
            <Clock className="h-3.5 w-3.5" />
          </Button>
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
        </div>
      </div>

      {/* History view */}
      {historyOpen && (
        <div className="flex-1 overflow-y-auto">
          {historyLoading && (
            <div className="p-4 flex items-center justify-center gap-2">
              <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">Loading history…</span>
            </div>
          )}
          {!historyLoading && historyError && (
            <div className="p-4 text-center">
              <p className="text-sm text-destructive">{historyError}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={fetchHistory}>
                Retry
              </Button>
            </div>
          )}
          {!historyLoading && !historyError && history && history.length === 0 && (
            <div className="p-4 text-center">
              <p className="text-sm text-muted-foreground">No saved reviews yet.</p>
            </div>
          )}
          {!historyLoading && !historyError && history && history.length > 0 && (
            <ul className="divide-y divide-border">
              {history.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => loadFromHistory(row.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors",
                      currentMeta?.id === row.id && "bg-accent/10"
                    )}
                  >
                    <div className="text-xs font-medium text-foreground">
                      {timeAgo(row.createdAt)}
                    </div>
                    {row.synthesizedRecommendation && (
                      <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {row.synthesizedRecommendation.slice(0, 80)}
                        {row.synthesizedRecommendation.length > 80 ? "…" : ""}
                      </div>
                    )}
                  </button>
                </li>
              ))}
              {historyTotal > history.length && (
                <li className="px-3 py-2 text-center text-xs text-muted-foreground">
                  Showing {history.length} of {historyTotal}
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Tabs */}
      {!historyOpen && review && (
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
      {!historyOpen && (
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
              {/* Inline error strip — shown when an error occurred while a review is already loaded
                  (e.g. loadFromHistory failure on a stale row). The "ran && !loading && !review"
                  branch above only fires when no review is available. */}
              {error && (
                <p className="text-xs text-destructive mb-2">{error}</p>
              )}
              {savedLabel && (
                <p className="text-[11px] text-muted-foreground mb-2">{savedLabel}</p>
              )}
              {activeTab === "consensus"
                ? renderConsensusTab(review.consensus)
                : renderReviewTab(review[activeTab])}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
