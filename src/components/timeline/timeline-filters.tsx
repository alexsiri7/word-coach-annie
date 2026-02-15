import { Button } from "@/components/ui/button";
import { StoryObjectType } from "@/lib/types";
import { Users, MapPin, GitBranch, Globe, StickyNote } from "lucide-react";

interface TimelineFiltersProps {
    visibleTypes: StoryObjectType[];
    onToggleType: (type: StoryObjectType) => void;
    zoomLevel: "CHAPTER" | "SCENE";
    onZoomChange: (level: "CHAPTER" | "SCENE") => void;
}

const TYPE_CONFIG: { type: StoryObjectType; label: string; icon: any }[] = [
    { type: "CHARACTER", label: "Characters", icon: Users },
    { type: "LOCATION", label: "Locations", icon: MapPin },
    { type: "PLOTLINE", label: "Plotlines", icon: GitBranch },
    { type: "WORLD_ELEMENT", label: "World", icon: Globe },
    { type: "NOTE", label: "Notes", icon: StickyNote },
];

export function TimelineFilters({
    visibleTypes,
    onToggleType,
    zoomLevel,
    onZoomChange,
}: TimelineFiltersProps) {
    return (
        <div className="flex items-center justify-between p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium mr-2 text-muted-foreground">Filter:</span>
                {TYPE_CONFIG.map(({ type, label, icon: Icon }) => {
                    const isActive = visibleTypes.includes(type);
                    return (
                        <Button
                            key={type}
                            variant={isActive ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => onToggleType(type)}
                            className={`gap-1.5 ${isActive ? "" : "text-muted-foreground"}`}
                        >
                            <Icon className="h-4 w-4" />
                            {label}
                        </Button>
                    );
                })}
            </div>

            <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
                <Button
                    variant={zoomLevel === "CHAPTER" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => onZoomChange("CHAPTER")}
                    className="h-7 text-xs"
                >
                    Chapters
                </Button>
                <Button
                    variant={zoomLevel === "SCENE" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => onZoomChange("SCENE")}
                    className="h-7 text-xs"
                >
                    Scenes
                </Button>
            </div>
        </div>
    );
}
