"use client";

import { useState } from "react";
import { TimelineData } from "@/lib/controllers/timeline";
import { StoryObjectType } from "@/lib/types";
import { TimelineFilters } from "./timeline-filters";
import { TimelineView } from "./timeline-view";

interface TimelineClientProps {
    initialData: TimelineData;
    projectId: string;
}

export function TimelineClient({ initialData, projectId }: TimelineClientProps) {
    const [filterTypes, setFilterTypes] = useState<StoryObjectType[]>([
        "CHARACTER",
        "LOCATION",
        "PLOTLINE",
        "WORLD_ELEMENT",
    ]);
    const [zoomLevel, setZoomLevel] = useState<"CHAPTER" | "SCENE">("SCENE");

    const handleToggleType = (type: StoryObjectType) => {
        setFilterTypes((prev) =>
            prev.includes(type)
                ? prev.filter((t) => t !== type)
                : [...prev, type]
        );
    };

    return (
        <div className="flex flex-col h-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <TimelineFilters
                visibleTypes={filterTypes}
                onToggleType={handleToggleType}
                zoomLevel={zoomLevel}
                onZoomChange={setZoomLevel}
            />
            <div className="flex-1 overflow-hidden relative">
                <TimelineView
                    data={initialData}
                    filterTypes={filterTypes}
                    zoomLevel={zoomLevel}
                    projectId={projectId}
                />
            </div>
        </div>
    );
}
