"use client";

import { useState } from "react";
import { Loader2, Users, Building2, PenLine, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sanitizeMessageContent } from "@/lib/sanitize";
import { cn } from "@/lib/utils";
import type { PeerReview, PeerReviewResult } from "@/app/api/projects/[id]/peer-review/route";

type Tab = "publisher" | "reader" | "writer" | "consensus";

const TAB_CONFIG: { key: Tab; label: string; icon: React.ElementType; description: string }[] = [
  {
    key: "publisher",
    label: "Publisher",
    icon: Building2,
    description: "Commercial & literary assessment",
  },
  {
    key: "reader",
    label: "Reader",
    icon: Users,
    description: "Honest reader reaction",
  },
  {
    key: "writer",
    label: "Writer",
    icon: PenLine,
    description: "Craft-focused feedback",
  },
  {
    key: "consensus",
    label: "Consensus",
    icon: Lightbulb,
    description: "Where all three agree",
  },
];

interface PeerReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function PeerReviewDialog({ open, onOpenChange, projectId }: PeerReviewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PeerReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("consensus");

  const runReview = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/peer-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Something went wrong");
        return;
      }

      const data: PeerReviewResult = await res.json();
      setResult(data);
      setActiveTab("consensus");
    } catch {
      setError("Could not connect to AI service");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!loading) {
      onOpenChange(open);
    }
  };

  const getTabContent = (): string => {
    if (!result) return "";
    if (activeTab === "consensus") return result.consensus;
    const review = result.reviews.find((r: PeerReview) => r.perspective === activeTab);
    return review?.content || "";
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-accent" />
            Peer Review
          </DialogTitle>
          <DialogDescription>
            Send your manuscript to three independent AI reviewers — a Publisher, a Reader, and an
            experienced Writer — then see where they agree.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {!result && !loading && (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 px-6 py-10">
              {error && (
                <div className="w-full px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-sm text-danger">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-3 gap-3 w-full max-w-md">
                {TAB_CONFIG.filter((t) => t.key !== "consensus").map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <div
                      key={tab.key}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border bg-surface-raised text-center"
                    >
                      <Icon className="h-5 w-5 text-accent/70" />
                      <span className="text-xs font-medium text-text-primary">{tab.label}</span>
                      <span className="text-[10px] text-text-muted leading-tight">{tab.description}</span>
                    </div>
                  );
                })}
              </div>
              <Button onClick={runReview} className="mt-2">
                Run peer review
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 text-text-muted px-6 py-10">
              <Loader2 className="h-7 w-7 animate-spin text-accent" />
              <p className="text-sm">Sending to three reviewers…</p>
              <p className="text-xs text-text-muted">This usually takes 15–30 seconds.</p>
            </div>
          )}

          {result && (
            <>
              {/* Tabs */}
              <div className="flex border-b border-border flex-shrink-0 px-1 pt-1">
                {TAB_CONFIG.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors",
                        activeTab === tab.key
                          ? "border-accent text-accent"
                          : "border-transparent text-text-muted hover:text-text-primary"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="prose-chat text-sm text-text-secondary [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_strong]:text-text-primary [&_ul]:space-y-0.5 [&_li]:text-xs [&_p]:leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {sanitizeMessageContent(getTabContent())}
                  </ReactMarkdown>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-3 border-t border-border flex-shrink-0">
                <Button variant="outline" size="sm" onClick={runReview} disabled={loading}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Run again
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
