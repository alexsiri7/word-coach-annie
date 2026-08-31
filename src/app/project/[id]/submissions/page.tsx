"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import type { ContestSubmission, PublicationSubmission } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  withdrawn: "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-300",
};

export default function SubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const [contestSubmissions, setContestSubmissions] = useState<ContestSubmission[]>([]);
  const [publicationSubmissions, setPublicationSubmissions] = useState<PublicationSubmission[]>([]);
  const [projectTitle, setProjectTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [contestsRes, pubsRes, projectRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/submissions/contests`),
          fetch(`/api/projects/${projectId}/submissions/publications`),
          fetch(`/api/projects/${projectId}`),
        ]);
        if (!contestsRes.ok || !pubsRes.ok) {
          console.error("[submissions/page] API error", {
            contests: contestsRes.status,
            publications: pubsRes.status,
          });
          throw new Error("Failed to load submissions");
        }
        if (!projectRes.ok) {
          console.error("[submissions/page] project fetch error", projectRes.status);
          throw new Error("Failed to load project");
        }
        const [contestsData, pubsData, proj] = await Promise.all([
          contestsRes.json(),
          pubsRes.json(),
          projectRes.json(),
        ]);
        setContestSubmissions(contestsData.submissions ?? []);
        setPublicationSubmissions(pubsData.submissions ?? []);
        setProjectTitle(proj.title ?? "");
      } catch (err) {
        console.error("[submissions/page] loadData failed", err);
        setError("Failed to load submissions. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [projectId]);

  const totalCount = contestSubmissions.length + publicationSubmissions.length;

  return (
    <div className="flex flex-col h-screen bg-surface">
      <div className="h-0.5 accent-gradient flex-shrink-0" />

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
            { label: "Submissions" },
          ]}
        />
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
                  <div key={i} className="h-16 bg-surface-overlay rounded" />
                ))}
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : totalCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <SendHorizontal className="h-12 w-12 opacity-20 mb-4" />
              <p className="text-lg font-editorial italic">No submissions yet</p>
              <p className="text-sm mt-1 opacity-70">
                Contest and publication submissions will appear here
              </p>
            </div>
          ) : (
            <div className="animate-fade-in">
              <header className="mb-8 space-y-3">
                <h1 className="display-lg italic font-bold tracking-tight text-text-primary">
                  Submissions
                </h1>
                <p className="label-md text-[11px] tracking-[0.2em] text-text-muted font-semibold">
                  {totalCount} {totalCount === 1 ? "submission" : "submissions"}
                </p>
              </header>

              {contestSubmissions.length > 0 && (
                <section className="mb-10">
                  <h2 className="text-xs font-bold tracking-widest text-text-muted uppercase mb-4">
                    Contest Submissions
                  </h2>
                  <div className="space-y-3">
                    {contestSubmissions.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-4 p-4 bg-surface-raised border border-border rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {s.contestName}
                          </p>
                          <p className="text-xs text-text-muted mt-0.5">
                            {s.provider.name} &middot;{" "}
                            {new Date(s.submissionDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                            {s.reviewDate && (
                              <>
                                {" "}
                                &middot; Review:{" "}
                                {new Date(s.reviewDate).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </>
                            )}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[s.status] ?? ""}`}
                        >
                          {s.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {publicationSubmissions.length > 0 && (
                <section>
                  <h2 className="text-xs font-bold tracking-widest text-text-muted uppercase mb-4">
                    Publication Submissions
                  </h2>
                  <div className="space-y-3">
                    {publicationSubmissions.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-4 p-4 bg-surface-raised border border-border rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {s.venueName}
                          </p>
                          <p className="text-xs text-text-muted mt-0.5">
                            {new Date(s.submissionDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[s.status] ?? ""}`}
                        >
                          {s.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
