"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";

export interface ContestSubmissionSummary {
  id: string;
  status: string;
  reviewDate: string | null;
}

export interface PublicationSubmissionSummary {
  id: string;
  status: string;
}

export interface SubmissionSummary {
  activeCount: number;
  nextReviewDate: string | null;
}

export function computeSubmissionSummary(
  contests: ContestSubmissionSummary[],
  pubs: PublicationSubmissionSummary[]
): SubmissionSummary {
  const activeCount = [
    ...contests.filter((s) => s.status === "submitted"),
    ...pubs.filter((s) => s.status === "submitted"),
  ].length;
  const nextReviewDate =
    contests
      .filter((s) => s.status === "submitted" && s.reviewDate)
      .map((s) => s.reviewDate!)
      .filter((d) => new Date(d) > new Date())
      .sort()[0] ?? null;
  return { activeCount, nextReviewDate };
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
        if (!contestsRes.ok || !pubsRes.ok) {
          console.warn("[SubmissionActivitySummary] fetch returned non-OK", {
            contests: contestsRes.status,
            publications: pubsRes.status,
          });
          return;
        }
        const [contestsData, pubsData] = await Promise.all([
          contestsRes.json(),
          pubsRes.json(),
        ]);
        const contests: ContestSubmissionSummary[] = contestsData.submissions ?? [];
        const pubs: PublicationSubmissionSummary[] = pubsData.submissions ?? [];
        setSummary(computeSubmissionSummary(contests, pubs));
      } catch (err) {
        console.error("[SubmissionActivitySummary] load failed", err);
        // Widget stays hidden — non-critical, by design
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
