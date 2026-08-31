"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";

interface ContestSubmission {
  id: string;
  status: string;
  reviewDate: string | null;
}

interface PublicationSubmission {
  id: string;
  status: string;
}

interface SubmissionSummary {
  activeCount: number;
  nextReviewDate: string | null;
}

export function SubmissionActivitySummary({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [summary, setSummary] = useState<SubmissionSummary | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [contestsRes, pubsRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/submissions/contests`),
          fetch(`/api/projects/${projectId}/submissions/publications`),
        ]);
        if (!contestsRes.ok || !pubsRes.ok) return;
        const [contestsData, pubsData] = await Promise.all([
          contestsRes.json(),
          pubsRes.json(),
        ]);
        const contests: ContestSubmission[] = contestsData.submissions ?? [];
        const pubs: PublicationSubmission[] = pubsData.submissions ?? [];
        const activeCount =
          contests.filter((s) => s.status === "submitted").length +
          pubs.filter((s) => s.status === "submitted").length;
        const upcoming =
          contests
            .filter((s) => s.status === "submitted" && s.reviewDate)
            .map((s) => s.reviewDate!)
            .filter((d) => new Date(d) > new Date())
            .sort()[0] ?? null;
        setSummary({ activeCount, nextReviewDate: upcoming });
      } catch {
        // silent - widget is non-critical
      }
    }
    load();
  }, [projectId]);

  if (!summary) return null;

  return (
    <button
      className="mt-6 w-full max-w-xs text-left border border-border rounded-lg p-4 bg-surface-raised hover:border-accent/40 transition-all group"
      onClick={() => router.push(`/project/${projectId}/submissions`)}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold tracking-widest text-text-muted uppercase">
          Submissions
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-text-muted group-hover:text-accent transition-colors" />
      </div>
      <p className="font-editorial text-2xl font-bold text-text-primary">
        {summary.activeCount}
      </p>
      <p className="text-xs text-text-muted mt-0.5">
        active submission{summary.activeCount !== 1 ? "s" : ""}
      </p>
      {summary.nextReviewDate && (
        <p className="text-xs text-accent mt-2">
          Next review:{" "}
          {new Date(summary.nextReviewDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </p>
      )}
    </button>
  );
}
