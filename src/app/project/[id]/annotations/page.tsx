"use client";

import { useEffect, useState, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardList, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { timeAgo } from "@/components/editor/editor-config";

interface AnnotationItem {
  id: string;
  content: string;
  nodeId: string;
  nodeTitle: string;
  projectTitle: string;
  selectedText: string | null;
  createdAt: string;
}

export default function AnnotationsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;
  const router = useRouter();
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [projectTitle, setProjectTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [annotsRes, projectRes] = await Promise.all([
          fetch(`/api/annotations?projectId=${projectId}`),
          fetch(`/api/projects/${projectId}`),
        ]);
        if (!annotsRes.ok) throw new Error("Failed to load annotations");
        const [annots, proj] = await Promise.all([annotsRes.json(), projectRes.json()]);
        setAnnotations(Array.isArray(annots) ? annots : []);
        setProjectTitle(proj.title ?? "");
      } catch (err) {
        console.error(err);
        setError("Failed to load annotations. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [projectId]);

  // Group annotations by scene (nodeId), preserving server order
  const grouped = useMemo(() => {
    const map = new Map<string, { nodeTitle: string; items: AnnotationItem[] }>();
    for (const a of annotations) {
      const existing = map.get(a.nodeId);
      if (existing) {
        existing.items.push(a);
      } else {
        map.set(a.nodeId, { nodeTitle: a.nodeTitle, items: [a] });
      }
    }
    return map;
  }, [annotations]);

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
            { label: "Annotations" },
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
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : annotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <ClipboardList className="h-12 w-12 opacity-20 mb-4" />
              <p className="text-lg font-editorial italic">No open annotations</p>
              <p className="text-sm mt-1 opacity-70">
                Annotations you add to scenes will appear here
              </p>
            </div>
          ) : (
            <div className="animate-fade-in">
              <header className="mb-14 space-y-3">
                <h1 className="display-lg italic font-bold tracking-tight text-text-primary">
                  Annotations
                </h1>
                <p className="label-md text-[11px] tracking-[0.2em] text-text-muted font-semibold">
                  {annotations.length} open {annotations.length === 1 ? "annotation" : "annotations"} across {grouped.size} {grouped.size === 1 ? "scene" : "scenes"}
                </p>
              </header>

              <div className="space-y-10">
                {[...grouped.entries()].map(([nodeId, group]) => (
                  <section key={nodeId} className="space-y-4">
                    <h2 className="font-editorial text-xl font-semibold italic text-text-primary border-b border-border/20 pb-3">
                      {group.nodeTitle}
                    </h2>
                    <div className="space-y-3">
                      {group.items.map((a) => (
                        <button
                          key={a.id}
                          className="w-full text-left bg-surface border border-border rounded-lg p-4 hover:border-accent/40 transition-all group"
                          onClick={() => router.push(`/project/${projectId}?scene=${a.nodeId}`)}
                        >
                          <div className="flex items-start gap-2">
                            <MessageSquare className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0" />
                            <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed flex-1">
                              {a.content}
                            </div>
                          </div>
                          {a.selectedText && (
                            <div className="mb-2 pl-7 mt-2">
                              <div className="bg-surface-sunken p-1.5 rounded text-xs text-text-muted italic truncate border border-border-subtle">
                                &quot;{a.selectedText}&quot;
                              </div>
                            </div>
                          )}
                          <div className="text-xs text-text-muted pl-7 mt-2">
                            {timeAgo(a.createdAt)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
