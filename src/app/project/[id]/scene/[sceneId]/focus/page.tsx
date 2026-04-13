"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const SceneEditor = dynamic(() => import("@/components/scene-editor").then(m => m.SceneEditor), {
  loading: () => <div className="flex items-center justify-center h-full"><div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>,
});
const SceneInfoSidebar = dynamic(() => import("@/components/focus-mode/scene-info-sidebar").then(m => m.SceneInfoSidebar));
const RelatedElementsPanel = dynamic(() => import("@/components/focus-mode/related-elements-panel").then(m => m.RelatedElementsPanel));
import { Loader2, Info, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { ErrorBoundary } from "@/components/error-boundary";
import type { StructureNode, Annotation } from "@/lib/types";

interface SceneContext extends StructureNode {
    chapterTitle?: string | null;
    prevScene: { id: string; title: string } | null;
    nextScene: { id: string; title: string } | null;
}

type RelatedElements = Record<string, { id: string; name: string; role?: string; description?: string; notes?: string }[]>;

export default function FocusModePage() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;
    const sceneId = params.sceneId as string;

    const [loading, setLoading] = useState(true);
    const [projectTitle, setProjectTitle] = useState<string>("");
    const [sceneContext, setSceneContext] = useState<SceneContext | null>(null);
    const [relatedElements, setRelatedElements] = useState<RelatedElements | null>(null);
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [leftCollapsed, setLeftCollapsed] = useState(true);
    const [rightCollapsed, setRightCollapsed] = useState(true);

    // Auto-open on desktop
    useEffect(() => {
        if (typeof window !== "undefined" && window.innerWidth >= 768) {
            setLeftCollapsed(false);
            setRightCollapsed(false);
        }
    }, []);

    // Fetch data
    useEffect(() => {
        async function loadData() {
            try {
                setLoading(true);
                // We'll need API routes for these since we're in "use client"
                // Or we can fetch from the existing generic node API + relationship API
                // For now, let's assume we add specific endpoints or reuse existing ones.
                // Actually, since we're in a client component, we should fetch from API.

                // Let's implement a specific API route for focus mode data OR misuse existing ones.
                // To stick to the plan, we should have created an API route. 
                // Let's create `src/app/api/focus/[sceneId]/route.ts` next.

                const [focusRes, projectRes] = await Promise.all([
                    fetch(`/api/focus/${sceneId}`),
                    fetch(`/api/projects/${projectId}`),
                ]);
                if (!focusRes.ok) throw new Error("Failed to load scene data");

                const data = await focusRes.json();
                setSceneContext(data.context);
                setRelatedElements(data.related);
                setAnnotations(data.annotations || []);

                if (projectRes.ok) {
                    const projectData = await projectRes.json();
                    setProjectTitle(projectData.title || "");
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }

        if (sceneId) {
            loadData();
        }
    }, [sceneId]);

    const handleNavigate = useCallback((targetSceneId: string) => {
        router.push(`/project/${projectId}/scene/${targetSceneId}/focus`);
    }, [projectId, router]);

    // Keyboard shortcuts: Escape collapses sidebars, Cmd+/ toggles left sidebar
    const keyboardActions = useMemo(() => ({
        onClosePanel: () => {
            if (!leftCollapsed) { setLeftCollapsed(true); return; }
            if (!rightCollapsed) { setRightCollapsed(true); return; }
        },
        onToggleSidebar: () => setLeftCollapsed((v) => !v),
    }), [leftCollapsed, rightCollapsed]);
    useKeyboardShortcuts(keyboardActions);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!sceneContext) {
        return <div className="p-8">Scene not found.</div>;
    }

    return (
        <div
            className="flex h-screen w-full overflow-hidden"
            style={{
                background: 'radial-gradient(ellipse 80% 60% at 50% -10%, hsl(var(--accent)/0.06) 0%, hsl(var(--surface)) 70%)',
            }}
        >
            <SceneInfoSidebar
                scene={{ ...sceneContext, wordCount: sceneContext.wordCount ?? 0 }}
                navigation={{
                    prevScene: sceneContext.prevScene,
                    nextScene: sceneContext.nextScene
                }}
                projectId={projectId}
                onNavigate={handleNavigate}
                collapsed={leftCollapsed}
                onToggle={() => setLeftCollapsed(!leftCollapsed)}
                relatedElements={relatedElements}
            />

            <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                <div className="px-4 py-2 border-b border-border bg-surface-raised flex-shrink-0">
                    <Breadcrumbs
                        items={[
                            { label: projectTitle || "Project", href: `/project/${projectId}` },
                            { label: sceneContext.title, href: `/project/${projectId}` },
                            { label: "Focus" },
                        ]}
                    />
                </div>
                <main className="flex-1 overflow-y-auto w-full">
                    <div className="max-w-3xl mx-auto px-8 py-12">
                        <ErrorBoundary fallbackTitle="Scene editor crashed">
                            <SceneEditor
                                node={{ ...sceneContext, type: "SCENE" }}
                                projectId={projectId}
                                showFocusButton={false}
                            />
                        </ErrorBoundary>
                    </div>
                </main>
                {/* Focus Mode Status Bar */}
                <div className="flex-shrink-0 px-8 py-2 flex items-center gap-3 bg-surface-raised/60 backdrop-blur-md border-t border-border/10">
                    <span className="font-label text-[10px] uppercase font-bold tracking-widest text-accent">
                        Focus Mode Active
                    </span>
                    <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant opacity-50">&middot;</span>
                    <span className="stamp-chip">Draft #1</span>
                    {sceneContext && (
                        <>
                            <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant opacity-50">&middot;</span>
                            <span className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">
                                {sceneContext.wordCount ?? 0} words
                            </span>
                        </>
                    )}
                    <div className="ml-auto">
                        <span className="stamp-chip">Mildly Critical</span>
                    </div>
                </div>
            </div>

            <RelatedElementsPanel
                elements={relatedElements || {}}
                annotations={annotations}
                collapsed={rightCollapsed}
                onToggle={() => setRightCollapsed(!rightCollapsed)}
            />

            {/* Mobile bottom bar */}
            <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 p-1.5 rounded-full bg-surface-raised border border-border shadow-xl backdrop-blur-md">
                <Button variant="ghost" size="sm" className="rounded-full px-4 h-10 gap-2" onClick={() => setLeftCollapsed(false)}>
                    <Info className="h-4 w-4" />
                    Info
                </Button>
                <div className="w-px h-6 bg-border mx-1" />
                <Button variant="ghost" size="sm" className="rounded-full px-4 h-10 gap-2" onClick={() => setRightCollapsed(false)}>
                    <Layers className="h-4 w-4" />
                    Related
                </Button>
            </div>
        </div>
    );
}
