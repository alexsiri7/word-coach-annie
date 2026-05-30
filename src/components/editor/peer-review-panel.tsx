"use client";

import { useState, useCallback, useEffect } from "react";
import { Users, RefreshCw, MessageSquare, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  actor?: ReviewFeedback;
  consensus: ConsensusFeedback;
  warning?: string;
}

interface ReviewMeta {
  id: string;
  createdAt: string;
}

interface HistoryRow {
  id: string;
  createdAt: string;
  synthesizedRecommendation: string;
}

interface ReviewDetail {
  id: string;
  createdAt: string;
  publisher: ReviewFeedback;
  reader: ReviewFeedback;
  writer: ReviewFeedback;
  actor?: ReviewFeedback;
  consensus: ConsensusFeedback;
}

interface PeerReviewPanelProps {
  projectId: string;
  onStartChat: (message: string) => void;
}

type TabKey = "publisher" | "reader" | "writer" | "actor" | "consensus";

const TABS: { key: TabKey; label: string }[] = [
  { key: "publisher", label: "Publisher" },
  { key: "reader", label: "Reader" },
  { key: "writer", label: "Writer" },
  { key: "actor", label: "Actor" },
  { key: "consensus", label: "Consensus" },
];

const SECTION_HEADING = "text-xs font-semibold text-text-muted uppercase tracking-wider mb-1";

const TIMESTAMP_FMT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatTimestamp(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return TIMESTAMP_FMT.format(d);
}

export function PeerReviewPanel({ projectId, onStartChat }: PeerReviewPanelProps) {
  const [review, setReview] = useState<PeerReviewResult | null>(null);
  const [currentMeta, setCurrentMeta] = useState<ReviewMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("publisher");
  const [error, setError] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);

  const applyReviewDetail = useCallback((detail: ReviewDetail) => {
    setReview({
      publisher: detail.publisher,
      reader: detail.reader,
      writer: detail.writer,
      actor: detail.actor,
      consensus: detail.consensus,
    });
    setCurrentMeta({ id: detail.id, createdAt: detail.createdAt });
    setRan(true);
  }, []);

  const fetchDetail = useCallback(async (id: string): Promise<ReviewDetail | null> => {
    const res = await fetch(`/api/projects/${projectId}/peer-review/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as ReviewDetail;
  }, [projectId]);

  useEffect(() => {
    let ignore = false;
    setReview(null);
    setCurrentMeta(null);
    setRan(false);
    setLoading(true);
    (async () => {
      try {
        const listRes = await fetch(`/api/projects/${projectId}/peer-review?limit=1`);
        if (!listRes.ok) return;
        const list = await listRes.json();
        const latestId = list?.data?.[0]?.id;
        if (!latestId) return;
        const detail = await fetchDetail(latestId);
        if (ignore || !detail) return;
        applyReviewDetail(detail);
      } catch {
        // Mount fetch failures are silent — user can still click "Run Peer Review".
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [projectId, applyReviewDetail, fetchDetail]);

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
        setError(`Request failed (${res.status})`);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
      setRan(true);
    }
  }, [projectId]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/peer-review?limit=20`);
      if (!res.ok) return;
      const data = await res.json();
      setHistory(data.data ?? []);
      setHistoryTotal(data.total ?? 0);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId]);

  const toggleHistory = useCallback(() => {
    setHistoryOpen((prev) => {
      if (!prev && history === null) void fetchHistory();
      return !prev;
    });
  }, [history, fetchHistory]);

  const loadFromHistory = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const detail = await fetchDetail(id);
      if (!detail) return;
      applyReviewDetail(detail);
      setHistoryOpen(false);
      setActiveTab("publisher");
    } finally {
      setLoading(false);
    }
  }, [fetchDetail, applyReviewDetail]);

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

      {historyOpen ? (
        <div className="flex-1 overflow-y-auto">
          {historyLoading && (
            <div className="p-4 flex items-center justify-center gap-2">
              <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">Loading history…</span>
            </div>
          )}
          {!historyLoading && history && history.length === 0 && (
            <div className="p-4 text-center">
              <p className="text-sm text-muted-foreground">No saved reviews yet.</p>
            </div>
          )}
          {!historyLoading && history && history.length > 0 && (
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
                      {formatTimestamp(row.createdAt)}
                    </div>
                    {row.synthesizedRecommendation && (
                      <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {row.synthesizedRecommendation}
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
      ) : (
        <>
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

          <div className="flex-1 overflow-y-auto">
            {!ran && !loading && (
              <div className="p-4 text-center">
                <p className="text-sm text-muted-foreground mb-3">
                  Get feedback from four AI reviewers: a Publisher, an Avid Reader, an Experienced Writer, and an Acting Coach.
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
                {currentMeta && (
                  <p className="text-[11px] text-muted-foreground mb-2">Saved {formatTimestamp(currentMeta.createdAt)}</p>
                )}
                {activeTab === "consensus"
                  ? renderConsensusTab(review.consensus)
                  : activeTab === "actor" && !review.actor
                    ? <p className="text-sm text-muted-foreground">Acting Coach review not available for this review.</p>
                    : renderReviewTab(review[activeTab] as ReviewFeedback)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
