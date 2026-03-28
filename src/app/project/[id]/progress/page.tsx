"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, PenLine, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WritingActivityHeatmap } from "@/components/writing-activity-heatmap";

interface StatusCounts {
  FINAL: number;
  REVISED: number;
  DRAFT: number;
  OUTLINE: number;
}

interface PartProgress {
  id: string;
  title: string;
  chapterCount: number;
  sceneCount: number;
  wordCount: number;
  statusCounts: StatusCounts;
}

interface ProgressData {
  totalWords: number;
  totalScenes: number;
  scenesDrafted: number;
  sceneStatusCounts: StatusCounts;
  partProgress: PartProgress[];
  nextScene: { id: string; title: string } | null;
  estimatedTotalWords: number | null;
}

function StatusBar({ counts, total }: { counts: StatusCounts; total: number }) {
  if (total === 0) return <div className="h-2 rounded-full bg-surface-base" />;
  const pct = (n: number) => Math.round((n / total) * 100);

  return (
    <div className="h-2 rounded-full overflow-hidden flex bg-surface-base">
      {counts.FINAL > 0 && (
        <div
          className="bg-green-500 h-full"
          style={{ width: `${pct(counts.FINAL)}%` }}
          title={`Final: ${counts.FINAL}`}
        />
      )}
      {counts.REVISED > 0 && (
        <div
          className="bg-blue-500 h-full"
          style={{ width: `${pct(counts.REVISED)}%` }}
          title={`Revised: ${counts.REVISED}`}
        />
      )}
      {counts.DRAFT > 0 && (
        <div
          className="bg-amber-500 h-full"
          style={{ width: `${pct(counts.DRAFT)}%` }}
          title={`Draft: ${counts.DRAFT}`}
        />
      )}
    </div>
  );
}

export default function ProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/progress`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  const completionPct =
    data && data.totalScenes > 0
      ? Math.round((data.scenesDrafted / data.totalScenes) * 100)
      : 0;

  return (
    <div className="flex h-screen flex-col bg-surface-base">
      <div className="h-0.5 accent-gradient flex-shrink-0" />

      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-surface-raised flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push(`/project/${projectId}`)}
          aria-label="Back to project"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-accent" />
          <span className="text-sm font-medium">Writing Progress</span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 animate-pulse bg-surface-raised rounded-lg" />
              ))}
            </div>
          ) : !data ? (
            <p className="text-text-muted text-sm">Failed to load progress data.</p>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-surface-raised rounded-lg p-4 space-y-1">
                  <p className="text-xs text-text-muted">Total words</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {data.totalWords.toLocaleString()}
                  </p>
                  {data.estimatedTotalWords && data.estimatedTotalWords > data.totalWords && (
                    <p className="text-xs text-text-muted">
                      Est. {data.estimatedTotalWords.toLocaleString()} final
                    </p>
                  )}
                </div>

                <div className="bg-surface-raised rounded-lg p-4 space-y-1">
                  <p className="text-xs text-text-muted">Scenes drafted</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {data.scenesDrafted}
                    <span className="text-base text-text-muted">/{data.totalScenes}</span>
                  </p>
                  <p className="text-xs text-text-muted">{completionPct}% complete</p>
                </div>

                <div className="bg-surface-raised rounded-lg p-4 space-y-1 col-span-2 sm:col-span-1">
                  <p className="text-xs text-text-muted">Scene status</p>
                  <div className="flex gap-2 text-xs flex-wrap">
                    {data.sceneStatusCounts.FINAL > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                        {data.sceneStatusCounts.FINAL} final
                      </span>
                    )}
                    {data.sceneStatusCounts.REVISED > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                        {data.sceneStatusCounts.REVISED} revised
                      </span>
                    )}
                    {data.sceneStatusCounts.DRAFT > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                        {data.sceneStatusCounts.DRAFT} draft
                      </span>
                    )}
                    {data.sceneStatusCounts.OUTLINE > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-surface-base border border-border" />
                        {data.sceneStatusCounts.OUTLINE} outline
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Overall progress bar */}
              {data.totalScenes > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span>Overall manuscript</span>
                    <span>{completionPct}%</span>
                  </div>
                  <StatusBar counts={data.sceneStatusCounts} total={data.totalScenes} />
                </div>
              )}

              {/* Part progress bars */}
              {data.partProgress.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider">
                    {data.partProgress[0].chapterCount > 0 ? "Parts" : "Chapters"}
                  </h2>
                  {data.partProgress.map((part) => (
                    <div key={part.id} className="bg-surface-raised rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{part.title}</p>
                        <span className="text-xs text-text-muted tabular-nums">
                          {part.wordCount.toLocaleString()} words
                        </span>
                      </div>
                      <StatusBar counts={part.statusCounts} total={part.sceneCount} />
                      <p className="text-xs text-text-muted">
                        {part.sceneCount - part.statusCounts.OUTLINE}/{part.sceneCount} scenes drafted
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Next up */}
              {data.nextScene && (
                <div className="space-y-2">
                  <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider">
                    Next up
                  </h2>
                  <div className="bg-surface-raised rounded-lg p-4 flex items-center gap-3">
                    <BookOpen className="h-5 w-5 text-accent flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{data.nextScene.title}</p>
                      <p className="text-xs text-text-muted">Next unwritten scene</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => router.push(`/project/${projectId}?scene=${data.nextScene!.id}`)}
                      className="flex items-center gap-1 flex-shrink-0"
                    >
                      <PenLine className="h-3.5 w-3.5" />
                      Start writing
                    </Button>
                  </div>
                </div>
              )}

              {/* Writing activity heatmap */}
              <div className="space-y-2">
                <h2 className="text-xs font-medium text-text-muted uppercase tracking-wider">
                  Writing activity
                </h2>
                <div className="bg-surface-raised rounded-lg p-4">
                  <WritingActivityHeatmap projectId={projectId} />
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
