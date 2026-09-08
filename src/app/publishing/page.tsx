"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookText, Info, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { deriveStoryStates, type Story } from "@/lib/story-placement";
import { PlacementBadge, StoryStateBadge } from "@/components/story-state-badge";

export default function PublishingPage() {
  const router = useRouter();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStories() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/publishing");
        if (!res.ok) throw new Error("Failed to load stories");
        setStories((await res.json()).stories ?? []);
      } catch (err) {
        console.error("[publishing/page] loadStories failed", err);
        setError("Failed to load your stories. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    loadStories();
  }, []);

  const states = deriveStoryStates(stories, new Date());
  const count = states.length;

  return (
    <div className="flex flex-col h-screen bg-surface">
      <div className="h-0.5 accent-gradient flex-shrink-0" />

      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-surface-raised flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push("/")}
          aria-label="Back to projects"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Breadcrumbs items={[{ label: "Publishing & contests" }]} />
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 md:px-16 lg:px-24 py-10 md:py-12">
          {loading ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-16 bg-surface-overlay rounded w-2/3" />
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 bg-surface-overlay rounded" />
                ))}
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : (
            <div className="animate-fade-in">
              <header className="mb-8 space-y-3">
                <h1 className="display-lg italic font-bold tracking-tight text-text-primary">
                  Publishing &amp; contests
                </h1>
                <p className="label-md text-[11px] tracking-[0.2em] text-text-muted font-semibold">
                  Where {count === 1 ? "your story is" : "your stories are"} right now
                </p>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => router.push("/opportunities")}
                  >
                    <Trophy className="h-3.5 w-3.5" /> Contests
                  </Button>
                </div>
              </header>

              {states.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-text-muted">
                  <BookText className="h-12 w-12 opacity-20 mb-4" />
                  <p className="text-lg font-editorial italic">No stories yet</p>
                  <p className="text-sm mt-1 opacity-70">Start a project and it will show up here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {states.map((state) => (
                    <div
                      key={state.story.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/project/${state.story.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/project/${state.story.id}`);
                        }
                      }}
                      className={`bg-surface border rounded-lg p-4 transition-all cursor-pointer hover:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/50 ${
                        state.kind === "back-on-shelf" ? "border-destructive/50 bg-destructive/5" : "border-border"
                      }`}
                    >
                      <div className="flex items-start gap-3 flex-wrap">
                        <p className="text-sm font-medium text-text-primary flex-1 min-w-0 truncate">
                          {state.story.title}
                        </p>
                        <StoryStateBadge state={state} />
                      </div>
                      {state.placements.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          {state.placements.map((placement) => (
                            <PlacementBadge key={placement.id} placement={placement} />
                          ))}
                        </div>
                      )}
                      {state.concurrentProviders.length > 0 && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs text-text-muted">
                          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
                          <span>
                            Out with {state.concurrentProviders.join(" and ")} at the same time — check
                            whether they allow simultaneous submissions.
                          </span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
