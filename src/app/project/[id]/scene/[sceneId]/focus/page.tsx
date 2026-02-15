"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { FocusController } from "@/lib/controllers/focus";
import { SceneEditor } from "@/components/scene-editor";
import { SceneInfoSidebar } from "@/components/focus-mode/scene-info-sidebar";
import { RelatedElementsPanel } from "@/components/focus-mode/related-elements-panel";
import { Loader2 } from "lucide-react";

export default function FocusModePage() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;
    const sceneId = params.sceneId as string;

    const [loading, setLoading] = useState(true);
    const [sceneContext, setSceneContext] = useState<any>(null);
    const [relatedElements, setRelatedElements] = useState<any>(null);
    const [leftCollapsed, setLeftCollapsed] = useState(false);
    const [rightCollapsed, setRightCollapsed] = useState(false);

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

                const res = await fetch(`/api/focus/${sceneId}`);
                if (!res.ok) throw new Error("Failed to load scene data");

                const data = await res.json();
                setSceneContext(data.context);
                setRelatedElements(data.related);
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
        <div className="flex h-screen w-full bg-background overflow-hidden">
            <SceneInfoSidebar
                scene={sceneContext}
                navigation={{
                    prevScene: sceneContext.prevScene,
                    nextScene: sceneContext.nextScene
                }}
                projectId={projectId}
                onNavigate={handleNavigate}
                collapsed={leftCollapsed}
                onToggle={() => setLeftCollapsed(!leftCollapsed)}
            />

            <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                <main className="flex-1 overflow-y-auto w-full max-w-3xl mx-auto px-8 py-12">
                    <SceneEditor
                        node={{ ...sceneContext, type: "SCENE" }}
                        projectId={projectId}
                        showFocusButton={false}
                    />
                </main>
            </div>

            <RelatedElementsPanel
                elements={relatedElements}
                collapsed={rightCollapsed}
                onToggle={() => setRightCollapsed(!rightCollapsed)}
            />
        </div>
    );
}
