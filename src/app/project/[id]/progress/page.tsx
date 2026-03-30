"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Play, Zap, Calendar, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { WritingHeatmap } from "@/components/writing-heatmap";
import type { ProjectProgress } from "@/lib/controllers/progress";

function formatWords(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function ProgressBar({ part }: { part: ProjectProgress["parts"][0] }) {
  const total = part.totalScenes;
  if (total === 0) return <div className="h-3 bg-surface-overlay w-full" />;

  const pct =
    ((part.finalScenes + part.revisedScenes + part.draftedScenes) / total) * 100;

  return (
    <div className="h-3 bg-surface-overlay w-full relative overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 bg-accent transition-all"
        style={{ width: `${pct}%` }}
      />
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
    <div className="flex flex-col h-screen bg-surface">
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
        <div className="max-w-5xl mx-auto px-6 md:px-16 lg:px-24 py-10 md:py-12">
          {loading ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-16 bg-surface-overlay rounded w-2/3" />
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-surface-overlay rounded" />
                ))}
              </div>
            </div>
          ) : !progress ? null : (
            <div className="animate-fade-in">
              {/* Manuscript Progress headline */}
              <header className="mb-14 space-y-3">
                <h1 className="display-lg italic font-bold tracking-tight text-text-primary">
                  Manuscript Progress
                </h1>
                <p className="label-md text-[11px] tracking-[0.2em] text-text-muted font-semibold">
                  {projectTitle ? `Project: ${projectTitle}` : ""}
                </p>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
                {/* Left column: progress bars + heatmap */}
                <div className="lg:col-span-8 space-y-14">
                  {/* Parts & Chapters section */}
                  {progress.parts.length > 0 && (
                    <section className="space-y-8">
                      <div className="flex justify-between items-end border-b border-border/20 pb-4">
                        <h3 className="font-editorial text-2xl font-semibold italic text-text-primary">
                          Parts &amp; Chapters
                        </h3>
                        <span className="label-md text-[10px] font-bold tracking-widest text-accent">
                          {pctDone}% Overall Completion
                        </span>
                      </div>
                      <div className="space-y-8">
                        {progress.parts.map((part) => {
                          const partDone =
                            part.finalScenes + part.revisedScenes + part.draftedScenes;
                          const partPct =
                            part.totalScenes > 0
                              ? Math.round((partDone / part.totalScenes) * 100)
                              : 0;

                          return (
                            <div key={part.id} className="space-y-3">
                              <div className="flex justify-between items-center label-md text-[11px] font-bold tracking-wider text-text-primary">
                                <span>{part.title}</span>
                                <span>{partPct}%</span>
                              </div>
                              <ProgressBar part={part} />
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* Writing Consistency heatmap section */}
                  <section className="space-y-8">
                    <div className="flex justify-between items-end border-b border-border/20 pb-4">
                      <h3 className="font-editorial text-2xl font-semibold italic text-text-primary">
                        Writing Consistency
                      </h3>
                      <div className="flex gap-2 items-center">
                        <span className="label-md text-[9px] tracking-widest text-text-muted">Less</span>
                        <div className="flex gap-1">
                          <div className="w-3 h-3 bg-surface-overlay" />
                          <div className="w-3 h-3 bg-accent/30" />
                          <div className="w-3 h-3 bg-accent/60" />
                          <div className="w-3 h-3 bg-accent" />
                        </div>
                        <span className="label-md text-[9px] tracking-widest text-text-muted">More</span>
                      </div>
                    </div>
                    <div className="bg-surface-overlay/50 p-6 md:p-8">
                      <WritingHeatmap variant="embedded" />
                    </div>
                  </section>
                </div>

                {/* Right column: summary report */}
                <div className="lg:col-span-4 lg:sticky lg:top-28">
                  <section className="bg-surface-overlay/60 p-6 md:p-8 border-l-4 border-accent/20 relative">
                    <div className="space-y-6">
                      {/* Summary quote */}
                      <div className="p-5 bg-surface-raised shadow-sm">
                        <p className="font-editorial text-lg leading-relaxed text-text-primary italic">
                          {pctDone === 100
                            ? "Every scene is finalized. The manuscript is complete."
                            : pctDone >= 75
                              ? "The finish line is in sight. Keep the momentum going."
                              : pctDone >= 50
                                ? "Halfway there. The hardest part is behind you."
                                : pctDone > 0
                                  ? "The journey has begun. Stay consistent and the words will come."
                                  : "Open a scene and start writing. The blank page awaits."
                          }
                        </p>
                      </div>

                      {/* Stats grid */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-accent-muted">
                          <p className="label-md text-[9px] font-bold tracking-widest text-accent opacity-80 mb-1">
                            Total Words
                          </p>
                          <p className="font-editorial text-2xl font-bold text-accent">
                            {formatWords(progress.totalWords)}
                          </p>
                        </div>
                        <div className="p-4 bg-surface-sunken">
                          <p className="label-md text-[9px] font-bold tracking-widest text-text-primary opacity-60 mb-1">
                            Scenes Done
                          </p>
                          <p className="font-editorial text-2xl font-bold text-text-primary">
                            {doneScenes}/{progress.totalScenes}
                          </p>
                        </div>
                      </div>

                      {/* Resume Writing CTA */}
                      {progress.nextScene && (
                        <div className="pt-4">
                          <Button
                            className="w-full gap-2 py-5 label-md text-[11px] font-bold tracking-[0.2em] shadow-[4px_4px_0px_hsl(var(--accent))] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_hsl(var(--accent))] transition-all"
                            onClick={() =>
                              router.push(
                                `/project/${projectId}?scene=${progress.nextScene!.id}`,
                              )
                            }
                          >
                            <Play className="h-4 w-4" />
                            Resume Writing
                          </Button>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Stamp chips (metadata) */}
                  <div className="mt-6 flex flex-wrap gap-2">
                    <span className="stamp-chip">
                      {formatWords(progress.totalWords)} total words
                    </span>
                    <span className="stamp-chip">
                      {progress.parts.length} {progress.parts.length === 1 ? "part" : "parts"}
                    </span>
                    <span className="stamp-chip">
                      {progress.totalScenes} scenes
                    </span>
                  </div>

                  {/* Writing Pace */}
                  {progress.pace && progress.pace.avgDailyWords > 0 && (
                    <section className="mt-8 bg-surface-overlay/60 p-6 md:p-8 border-l-4 border-accent/20">
                      <h3 className="font-editorial text-lg font-semibold italic text-text-primary mb-5">
                        Writing Pace
                      </h3>
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <Zap className="h-4 w-4 text-accent shrink-0" />
                          <div>
                            <p className="label-md text-[9px] font-bold tracking-widest text-text-muted mb-0.5">
                              Avg Daily Output
                            </p>
                            <p className="font-editorial text-xl font-bold text-accent tabular-nums">
                              {formatWords(progress.pace.avgDailyWords)}
                              <span className="text-sm text-text-muted font-normal ml-1">words/day</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Calendar className="h-4 w-4 text-accent shrink-0" />
                          <div>
                            <p className="label-md text-[9px] font-bold tracking-widest text-text-muted mb-0.5">
                              Active Days
                            </p>
                            <p className="font-editorial text-xl font-bold text-text-primary tabular-nums">
                              {progress.pace.activeDays}
                              <span className="text-sm text-text-muted font-normal ml-1">of 28</span>
                            </p>
                          </div>
                        </div>
                        {progress.pace.estimatedDaysRemaining !== null && (
                          <div className="flex items-center gap-3">
                            <TrendingUp className="h-4 w-4 text-success shrink-0" />
                            <div>
                              <p className="label-md text-[9px] font-bold tracking-widest text-text-muted mb-0.5">
                                Est. Completion
                              </p>
                              <p className="font-editorial text-xl font-bold text-text-primary tabular-nums">
                                ~{progress.pace.estimatedDaysRemaining}
                                <span className="text-sm text-text-muted font-normal ml-1">
                                  {progress.pace.estimatedDaysRemaining === 1 ? "day" : "days"}
                                </span>
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                      <p className="label-md text-[9px] tracking-widest text-text-muted mt-4">
                        Based on 4 weeks of writing sessions
                      </p>
                    </section>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
