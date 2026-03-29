"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, CheckCircle2, FileText, TrendingUp, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import type { ProjectProgress } from "@/lib/controllers/progress";

const STATUS_COLORS = {
  FINAL: "bg-success",
  REVISED: "bg-blue-500",
  DRAFT: "bg-amber-400",
  OUTLINE: "bg-surface-overlay",
} as const;

const STATUS_LABELS = {
  FINAL: "Final",
  REVISED: "Revised",
  DRAFT: "Draft",
  OUTLINE: "Outline",
} as const;

function formatWords(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function ProgressBar({ part }: { part: ProjectProgress["parts"][0] }) {
  const total = part.totalScenes;
  if (total === 0) return <div className="h-2 rounded-full bg-surface-overlay w-full" />;

  return (
    <div className="h-2 rounded-full bg-surface-overlay w-full overflow-hidden flex">
      {part.finalScenes > 0 && (
        <div
          className="h-full bg-success transition-all"
          style={{ width: `${(part.finalScenes / total) * 100}%` }}
          title={`${part.finalScenes} Final`}
        />
      )}
      {part.revisedScenes > 0 && (
        <div
          className="h-full bg-blue-500 transition-all"
          style={{ width: `${(part.revisedScenes / total) * 100}%` }}
          title={`${part.revisedScenes} Revised`}
        />
      )}
      {part.draftedScenes > 0 && (
        <div
          className="h-full bg-amber-400 transition-all"
          style={{ width: `${(part.draftedScenes / total) * 100}%` }}
          title={`${part.draftedScenes} Draft`}
        />
      )}
    </div>
  );
}

export default function ProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;
  const router = useRouter();
  const [progress, setProgress] = useState<ProjectProgress | null>(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}/progress`).then((r) => r.json()),
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
    ]).then(([prog, proj]) => {
      setProgress(prog);
      setProjectTitle(proj.title ?? "");
      setLoading(false);
    });
  }, [projectId]);

  const doneScenes = progress
    ? progress.draftedScenes + progress.revisedScenes + progress.finalScenes
    : 0;
  const pctDone = progress && progress.totalScenes > 0
    ? Math.round((doneScenes / progress.totalScenes) * 100)
    : 0;

  return (
    <div className="flex flex-col h-screen">
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
        <Breadcrumbs
          items={[
            { label: projectTitle || "Project", href: `/project/${projectId}` },
            { label: "Progress" },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-10">
          {loading ? (
            <div className="space-y-6 animate-pulse">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="glass-card p-5 h-24 bg-surface-overlay rounded-xl" />
                ))}
              </div>
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="glass-card p-4 h-16 bg-surface-overlay rounded-xl" />
                ))}
              </div>
            </div>
          ) : !progress ? null : (
            <div className="space-y-8 animate-fade-in">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-accent" />
                    <span className="text-xs text-text-muted uppercase tracking-wide">Words</span>
                  </div>
                  <p className="text-2xl font-bold text-text-primary tabular-nums">
                    {formatWords(progress.totalWords)}
                  </p>
                </div>
                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="h-4 w-4 text-accent" />
                    <span className="text-xs text-text-muted uppercase tracking-wide">Scenes</span>
                  </div>
                  <p className="text-2xl font-bold text-text-primary tabular-nums">
                    {doneScenes}
                    <span className="text-base text-text-muted font-normal">/{progress.totalScenes}</span>
                  </p>
                </div>
                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-accent" />
                    <span className="text-xs text-text-muted uppercase tracking-wide">Progress</span>
                  </div>
                  <p className="text-2xl font-bold text-text-primary tabular-nums">{pctDone}%</p>
                </div>
                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="text-xs text-text-muted uppercase tracking-wide">Final</span>
                  </div>
                  <p className="text-2xl font-bold text-text-primary tabular-nums">
                    {progress.finalScenes}
                  </p>
                </div>
              </div>

              {/* Status legend */}
              <div className="flex items-center gap-4 flex-wrap">
                {(["FINAL", "REVISED", "DRAFT", "OUTLINE"] as const).map((s) => (
                  <div key={s} className="flex items-center gap-1.5 text-xs text-text-muted">
                    <div className={`h-2 w-4 rounded-full ${STATUS_COLORS[s]}`} />
                    {STATUS_LABELS[s]}
                  </div>
                ))}
              </div>

              {/* Part-by-part breakdown */}
              {progress.parts.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
                    By {progress.parts[0]?.type === "PART" ? "Part" : "Chapter"}
                  </h2>
                  <div className="space-y-3">
                    {progress.parts.map((part) => (
                      <div key={part.id} className="glass-card p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-text-primary text-sm">{part.title}</span>
                          <span className="text-xs text-text-muted tabular-nums">
                            {part.finalScenes + part.revisedScenes + part.draftedScenes}/
                            {part.totalScenes} scenes · {formatWords(part.totalWords)} words
                          </span>
                        </div>
                        <ProgressBar part={part} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next up */}
              {progress.nextScene && (
                <div className="glass-card p-5 border-accent/30">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-accent uppercase tracking-wide font-medium mb-1">
                        Next Up
                      </p>
                      <h3 className="font-semibold text-text-primary">
                        {progress.nextScene.parentTitle
                          ? `${progress.nextScene.parentTitle} / `
                          : ""}
                        {progress.nextScene.title}
                      </h3>
                      {progress.nextScene.synopsis && (
                        <p className="text-sm text-text-muted mt-1 line-clamp-2">
                          {progress.nextScene.synopsis}
                        </p>
                      )}
                      <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-surface-overlay text-text-muted">
                        {STATUS_LABELS[progress.nextScene.status as keyof typeof STATUS_LABELS] ??
                          progress.nextScene.status}
                      </span>
                    </div>
                    <Button
                      className="gap-2 shrink-0"
                      onClick={() =>
                        router.push(
                          `/project/${projectId}?scene=${progress.nextScene!.id}`,
                        )
                      }
                    >
                      <Play className="h-4 w-4" />
                      Start Writing
                    </Button>
                  </div>
                </div>
              )}

              {progress.totalScenes > 0 && progress.finalScenes === progress.totalScenes && (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
                  <h3 className="text-lg font-semibold text-text-primary">
                    All scenes finalized!
                  </h3>
                  <p className="text-text-muted mt-1">
                    Every scene is marked as final. Great work.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
