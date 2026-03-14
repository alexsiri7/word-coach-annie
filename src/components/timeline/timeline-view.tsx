"use client";

import { useRouter } from "next/navigation";
import {
    StoryObjectType,
} from "@/lib/types";
import {
    SCENE_STATUS_COLORS,
    STORY_OBJECT_ICONS,
} from "@/lib/constants";
import { TimelineData } from "@/lib/controllers/timeline";
import { Users, MapPin, GitBranch, Globe, StickyNote, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface TimelineViewProps {
    data: TimelineData;
    filterTypes: StoryObjectType[];
    zoomLevel: "CHAPTER" | "SCENE";
    projectId: string; // Add projectId to props
}

const ICON_MAP: Record<string, typeof Users> = {
    Users,
    MapPin,
    GitBranch,
    Globe,
    StickyNote,
};

export function TimelineView({ data, filterTypes, zoomLevel: _zoomLevel, projectId }: TimelineViewProps) {
    const router = useRouter();
    const { scenes, objects, events } = data;

    // Filter objects
    const visibleObjects = objects.filter((obj) => filterTypes.includes(obj.type));

    // Determine grid columns based on zoom level
    // For now, simpler implementation: just show scenes (zoomLevel ignored for now or can be added later)
    const columns = scenes;

    const handleSceneClick = (sceneId: string) => {
        router.push(`/project/${projectId}/scene/${sceneId}/focus`);
    };

    const getRelationship = (objectId: string, sceneId: string) => {
        return events.find(
            (e) =>
                (e.fromObjectId === objectId && e.toNodeId === sceneId) ||
                (e.fromNodeId === sceneId && e.toObjectId === objectId)
        );
    };

    return (
        <div className="overflow-auto flex-1">
            <div className="min-w-max relative">
                {/* Header Row (Scenes) */}
                <div className="flex sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
                    <div className="w-48 shrink-0 p-3 font-semibold text-sm border-r flex items-center justify-center bg-muted/30">
                        Story Objects
                    </div>
                    {columns.map((scene) => (
                        <div
                            key={scene.id}
                            className="w-32 shrink-0 p-2 border-r last:border-r-0 flex flex-col justify-end group cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => handleSceneClick(scene.id)}
                        >
                            <div className="text-[10px] uppercase text-muted-foreground font-medium mb-1 truncate">
                                {scene.type} {scene.orderIndex + 1}
                            </div>
                            <div
                                className="text-xs font-semibold truncate"
                                title={scene.title}
                            >
                                {scene.title}
                            </div>
                            <div className={cn("h-1 w-full mt-2 rounded-full", SCENE_STATUS_COLORS[scene.status as keyof typeof SCENE_STATUS_COLORS])} />
                        </div>
                    ))}
                </div>

                {/* Object Rows */}
                <div className="divide-y">
                    {visibleObjects.map((obj) => {
                        const Icon = ICON_MAP[STORY_OBJECT_ICONS[obj.type]] || Activity;
                        return (
                            <div key={obj.id} className="flex hover:bg-muted/10 transition-colors">
                                <div className="w-48 shrink-0 p-3 border-r sticky left-0 bg-background flex items-center gap-2 group cursor-pointer z-0">
                                    <div className="p-1.5 rounded-md bg-muted group-hover:bg-primary/10 transition-colors">
                                        <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                                    </div>
                                    <div className="overflow-hidden">
                                        <div className="text-sm font-medium truncate">{obj.name}</div>
                                        <div className="text-[10px] text-muted-foreground truncate uppercase">
                                            {obj.type}
                                        </div>
                                    </div>
                                </div>
                                {columns.map((scene) => {
                                    const rel = getRelationship(obj.id, scene.id);
                                    return (
                                        <div
                                            key={`${obj.id}-${scene.id}`}
                                            className="w-32 shrink-0 border-r last:border-r-0 p-2 flex items-center justify-center relative"
                                        >
                                            {/* Connection Line Placeholder - simplified for grid */}
                                            {/* logic for lines would span multiple cells, simpler to do distinct markers first */}

                                            {rel && (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center cursor-help hover:scale-110 transition-transform">
                                                                <Activity className="h-3 w-3 text-primary" />
                                                            </div>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p className="font-semibold text-xs mb-1">{rel.type}</p>
                                                            {rel.label && <p className="text-xs text-muted-foreground">{rel.label}</p>}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                    {visibleObjects.length === 0 && (
                        <div className="p-8 text-center text-muted-foreground text-sm">
                            No objects found matching the selected filters.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
