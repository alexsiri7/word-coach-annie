"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RelatedElements } from "@/app/project/[id]/scene/[sceneId]/focus/page";

interface SceneInfoSidebarProps {
    scene: {
        title: string;
        synopsis?: string | null;
        status: string;
        wordCount: number;
        chapterTitle?: string | null;
    };
    navigation: {
        prevScene: { id: string; title: string } | null;
        nextScene: { id: string; title: string } | null;
    };
    projectId: string;
    onNavigate: (sceneId: string) => void;
    collapsed: boolean;
    onToggle: () => void;
    relatedElements?: RelatedElements | null;
}

export function SceneInfoSidebar({
    scene,
    navigation,
    projectId,
    onNavigate,
    collapsed,
    onToggle,
    relatedElements
}: SceneInfoSidebarProps) {
    if (collapsed) {
        return (
            <div className="hidden md:flex w-12 border-r bg-background flex-col items-center py-4 gap-4 h-full shrink-0">
                <Button variant="ghost" size="icon" onClick={onToggle} title="Expand Info">
                    <ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        );
    }

    return (
        <>
            <div className="md:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm animate-in fade-in" onClick={onToggle} />
            <div className={cn(
                "flex flex-col h-full bg-background border-r shrink-0",
                "fixed inset-y-0 left-0 z-50 w-80 shadow-2xl animate-slide-in-left",
                "md:relative md:shadow-none md:z-auto"
            )}>
                <div className="p-4 border-b border-outline-variant/10 flex items-center justify-between">
                    <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Scene Info</h2>
                    <Button variant="ghost" size="icon" onClick={onToggle} className="h-6 w-6">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {/* IN THIS SCENE */}
                    <div className="p-4 border-b border-outline-variant/10">
                        <span className="font-label text-[10px] uppercase font-bold tracking-widest text-on-surface-variant block mb-3">
                            In This Scene
                        </span>
                        {/* Characters */}
                        {relatedElements?.CHARACTER && relatedElements.CHARACTER.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                                {relatedElements.CHARACTER.map(char => (
                                    <div key={char.id} className="flex items-center gap-1.5 bg-surface-container-low px-2 py-1">
                                        <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent">
                                            {char.name[0]}
                                        </div>
                                        <span className="font-body text-xs text-text-primary">{char.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {/* Locations */}
                        {relatedElements?.LOCATION && relatedElements.LOCATION.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {relatedElements.LOCATION.map(loc => (
                                    <div key={loc.id} className="flex items-center gap-1.5 bg-surface-container-low px-2 py-1">
                                        <MapPin className="h-3 w-3 text-on-surface-variant" />
                                        <span className="font-body text-xs text-text-primary">{loc.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {(!relatedElements?.CHARACTER?.length && !relatedElements?.LOCATION?.length) && (
                            <p className="font-body text-xs text-on-surface-variant">No characters or locations tagged yet.</p>
                        )}
                    </div>

                    {/* ANNIE'S ADVICE */}
                    <div className="p-4 border-b border-outline-variant/10">
                        <span className="font-label text-[10px] uppercase font-bold tracking-widest text-on-surface-variant block mb-3">
                            Annie&apos;s Advice
                        </span>
                        <div className="glass-card p-3 space-y-2">
                            <p className="font-editorial italic text-sm text-text-primary leading-snug">
                                &ldquo;Need a plot twist? Try flipping a character&apos;s motivation.&rdquo;
                            </p>
                            <div className="flex flex-wrap gap-1 pt-1">
                                {["Need a plot twist?", "Add character conflict?"].map(prompt => (
                                    <span key={prompt} className="stamp-chip text-[10px] cursor-pointer hover:bg-surface-container transition-colors">
                                        {prompt}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* NARRATIVE BEATS */}
                    <div className="p-4">
                        <span className="font-label text-[10px] uppercase font-bold tracking-widest text-on-surface-variant block mb-3">
                            Narrative Beats
                        </span>
                        {scene.synopsis ? (
                            <div className="space-y-2">
                                {scene.synopsis.split('.').filter(s => s.trim().length > 0).slice(0, 4).map((beat, i) => (
                                    <div key={i} className="flex items-start gap-2">
                                        <div className="w-4 h-4 mt-0.5 border border-outline-variant/30 flex-shrink-0" />
                                        <span className="font-body text-xs text-on-surface-variant leading-snug">{beat.trim()}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="font-body text-xs text-on-surface-variant">Add a synopsis to see narrative beats.</p>
                        )}
                    </div>
                </div>

                {/* Navigation */}
                <div className="p-4 border-t border-outline-variant/10 space-y-2">
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            className="flex-1 justify-start text-xs h-9 overflow-hidden"
                            disabled={!navigation.prevScene}
                            onClick={() => navigation.prevScene && onNavigate(navigation.prevScene.id)}
                        >
                            <ChevronLeft className="h-3 w-3 mr-1 shrink-0" />
                            <span className="truncate">{navigation.prevScene ? navigation.prevScene.title : "Start"}</span>
                        </Button>
                        <Button
                            variant="outline"
                            className="flex-1 justify-end text-xs h-9 overflow-hidden"
                            disabled={!navigation.nextScene}
                            onClick={() => navigation.nextScene && onNavigate(navigation.nextScene.id)}
                        >
                            <span className="truncate">{navigation.nextScene ? navigation.nextScene.title : "End"}</span>
                            <ChevronRight className="h-3 w-3 ml-1 shrink-0" />
                        </Button>
                    </div>
                    <Button variant="ghost" className="w-full text-xs text-muted-foreground h-8" onClick={() => window.location.href = `/project/${projectId}`}>
                        Back to Dashboard
                    </Button>
                </div>
            </div>
        </>
    );
}
