"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Hash, FileText, Target } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

export function SceneInfoSidebar({
    scene,
    navigation,
    projectId,
    onNavigate,
    collapsed,
    onToggle
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
                <div className="p-4 border-b flex items-center justify-between">
                    <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Scene Info</h2>
                    <Button variant="ghost" size="icon" onClick={onToggle} className="h-6 w-6">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div>
                        <div className="text-xs text-muted-foreground mb-1">
                            {scene.chapterTitle ? scene.chapterTitle : "No Chapter"}
                        </div>
                        <h1 className="text-xl font-bold leading-tight">{scene.title}</h1>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-accent/5 rounded-lg border border-accent/10">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                <Target className="h-3 w-3" /> Status
                            </div>
                            <div className="font-medium text-sm capitalize">{scene.status.toLowerCase()}</div>
                        </div>
                        <div className="p-3 bg-accent/5 rounded-lg border border-accent/10">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                <FileText className="h-3 w-3" /> Words
                            </div>
                            <div className="font-medium text-sm">{scene.wordCount}</div>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                            <Hash className="h-3 w-3" /> Synopsis
                        </h3>
                        <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md min-h-[100px] border border-border/50">
                            {scene.synopsis || "No synopsis available."}
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t bg-muted/10 space-y-2">
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
