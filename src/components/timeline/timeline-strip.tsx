"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SCENE_STATUS_DOT_COLORS } from "@/lib/constants";
import type { SceneStatus } from "@/lib/types";

interface TimelineScene {
  id: string;
  title: string;
  status: string;
  orderIndex: number;
  chapterTitle?: string;
}

interface TimelineStripProps {
  scenes: TimelineScene[];
  currentSceneId: string;
  projectId: string;
  className?: string;
}

const STATUS_COLORS: Record<SceneStatus, string> = {
  OUTLINE: "bg-muted-foreground/30",
  DRAFT: "bg-amber-400",
  REVISED: "bg-blue-400",
  FINAL: "bg-green-500",
};

/**
 * TimelineStrip — compact horizontal scene timeline embeddable below the editor.
 * Shows the current scene's position in story chronology.
 * Click a marker to navigate to that scene in focus mode.
 */
export function TimelineStrip({ scenes, currentSceneId, projectId, className }: TimelineStripProps) {
  const router = useRouter();

  if (scenes.length === 0) return null;

  const currentIndex = scenes.findIndex((s) => s.id === currentSceneId);

  return (
    <TooltipProvider>
      <div
        className={cn(
          "flex items-center gap-0.5 px-3 py-1.5 overflow-x-auto scrollbar-thin",
          "bg-muted/30 border-t border-border/50",
          className
        )}
        role="navigation"
        aria-label="Story timeline"
      >
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide mr-2 shrink-0">
          Timeline
        </span>
        <div className="flex items-center gap-0.5">
          {scenes.map((scene, idx) => {
            const isCurrent = scene.id === currentSceneId;
            const isPast = idx < currentIndex;
            const status = scene.status as SceneStatus;

            return (
              <Tooltip key={scene.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() =>
                      router.push(`/project/${projectId}/scene/${scene.id}/focus`)
                    }
                    className={cn(
                      "h-2 rounded-full transition-all duration-150 shrink-0 cursor-pointer",
                      "hover:scale-125 focus:outline-none focus:ring-1 focus:ring-accent",
                      isCurrent
                        ? "w-4 " + STATUS_COLORS[status]
                        : isPast
                        ? "w-2 " + STATUS_COLORS[status] + " opacity-70"
                        : "w-2 bg-muted-foreground/20"
                    )}
                    aria-label={`${scene.title} (${scene.status.toLowerCase()})`}
                    aria-current={isCurrent ? "step" : undefined}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-48">
                  <p className="text-xs font-medium">{scene.title}</p>
                  {scene.chapterTitle && (
                    <p className="text-xs text-muted-foreground">{scene.chapterTitle}</p>
                  )}
                  <p className="text-xs text-muted-foreground capitalize">
                    {scene.status.toLowerCase()}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        {currentIndex >= 0 && (
          <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
            {currentIndex + 1} / {scenes.length}
          </span>
        )}
      </div>
    </TooltipProvider>
  );
}
