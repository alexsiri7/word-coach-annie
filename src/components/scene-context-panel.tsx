"use client";

import { useEffect, useState } from "react";
import { Users, MapPin, GitBranch, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { StoryObject } from "@/lib/types";

interface SceneRelationship {
  id: string;
  type: string;
  fromObjectId?: string | null;
  toObjectId?: string | null;
  fromNodeId?: string | null;
  toNodeId?: string | null;
  fromObject?: { id: string; name: string; type: string } | null;
  toObject?: { id: string; name: string; type: string } | null;
}

interface SceneContextPanelProps {
  projectId: string;
  sceneId: string;
  storyObjects: StoryObject[];
  onSelectObject: (objectId: string, source?: "project" | "universe") => void;
  onAddRelationship?: (objectId: string, type: string) => Promise<void>;
}

function ObjectButton({
  obj,
  onClick,
  inScene,
}: {
  obj: StoryObject;
  onClick: () => void;
  inScene: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-1.5 rounded-md text-sm transition-all flex items-center gap-2",
        inScene
          ? "text-text-primary hover:bg-surface-overlay/60"
          : "text-text-muted hover:bg-surface-overlay/40"
      )}
    >
      <span className="truncate flex-1">{obj.name}</span>
      {obj.role && (
        <span className="text-xs text-text-muted flex-shrink-0">{obj.role}</span>
      )}
      {!inScene && (
        <span className="text-xs text-text-muted/60 flex-shrink-0 italic">other</span>
      )}
    </button>
  );
}

export function SceneContextPanel({
  projectId,
  sceneId,
  storyObjects,
  onSelectObject,
  onAddRelationship,
}: SceneContextPanelProps) {
  const [relationships, setRelationships] = useState<SceneRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllCharacters, setShowAllCharacters] = useState(false);
  const [showAllPlotlines, setShowAllPlotlines] = useState(false);
  const [addingRelationship, setAddingRelationship] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/projects/${projectId}/relationships`)
      .then((res) => res.json())
      .then((data) => {
        const rels: SceneRelationship[] = data.data || [];
        // Filter to only relationships involving this scene
        const sceneRels = rels.filter(
          (r) => r.fromNodeId === sceneId || r.toNodeId === sceneId
        );
        setRelationships(sceneRels);
      })
      .catch(() => setRelationships([]))
      .finally(() => setLoading(false));
  }, [projectId, sceneId]);

  // Find which story object IDs are linked to this scene
  const linkedObjectIds = new Set<string>();
  const locationIds = new Set<string>();
  const plotlineIds = new Set<string>();

  for (const rel of relationships) {
    const objId = rel.fromObjectId || rel.toObjectId;
    if (!objId) continue;

    if (rel.type === "APPEARS_IN") {
      linkedObjectIds.add(objId);
    } else if (rel.type === "LOCATED_AT") {
      locationIds.add(objId);
    } else if (rel.type === "PART_OF_PLOTLINE") {
      plotlineIds.add(objId);
    }
  }

  const allCharacters = storyObjects.filter((o) => o.type === "CHARACTER");
  const inSceneCharacters = allCharacters.filter((o) => linkedObjectIds.has(o.id));
  const otherCharacters = allCharacters.filter((o) => !linkedObjectIds.has(o.id));

  const allLocations = storyObjects.filter((o) => o.type === "LOCATION");
  const sceneLocations = allLocations.filter((o) => locationIds.has(o.id));

  const allPlotlines = storyObjects.filter((o) => o.type === "PLOTLINE");
  const activePlotlines = allPlotlines.filter((o) => plotlineIds.has(o.id));
  const otherPlotlines = allPlotlines.filter((o) => !plotlineIds.has(o.id));

  const handleAddToScene = async (obj: StoryObject) => {
    if (!onAddRelationship) return;
    setAddingRelationship(obj.id);
    try {
      const type =
        obj.type === "CHARACTER"
          ? "APPEARS_IN"
          : obj.type === "LOCATION"
          ? "LOCATED_AT"
          : "PART_OF_PLOTLINE";
      await onAddRelationship(obj.id, type);
      // Re-fetch relationships
      const res = await fetch(`/api/projects/${projectId}/relationships`);
      const data = await res.json();
      const rels: SceneRelationship[] = data.data || [];
      setRelationships(rels.filter((r) => r.fromNodeId === sceneId || r.toNodeId === sceneId));
    } finally {
      setAddingRelationship(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-2 py-3">
      {/* Characters */}
      <section>
        <div className="flex items-center gap-1.5 px-1 mb-1">
          <Users className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Characters
          </span>
          {inSceneCharacters.length > 0 && (
            <span className="text-xs text-accent ml-1">
              {inSceneCharacters.length} in scene
            </span>
          )}
        </div>
        <div className="space-y-0.5">
          {inSceneCharacters.length === 0 && otherCharacters.length === 0 && (
            <p className="text-xs text-text-muted px-3 py-2">No characters yet</p>
          )}
          {inSceneCharacters.map((obj) => (
            <ObjectButton
              key={obj.id}
              obj={obj}
              inScene
              onClick={() => onSelectObject(obj.id, obj.source || "project")}
            />
          ))}
          {otherCharacters.length > 0 && (
            <>
              <button
                onClick={() => setShowAllCharacters((v) => !v)}
                className="flex items-center gap-1 px-3 py-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                {showAllCharacters ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {otherCharacters.length} other{otherCharacters.length !== 1 ? "s" : ""}
              </button>
              {showAllCharacters &&
                otherCharacters.map((obj) => (
                  <div key={obj.id} className="flex items-center gap-1">
                    <ObjectButton
                      obj={obj}
                      inScene={false}
                      onClick={() => onSelectObject(obj.id, obj.source || "project")}
                    />
                    {onAddRelationship && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0 opacity-60 hover:opacity-100"
                        title="Add to scene"
                        disabled={addingRelationship === obj.id}
                        onClick={() => handleAddToScene(obj)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
            </>
          )}
        </div>
      </section>

      {/* Location */}
      <section>
        <div className="flex items-center gap-1.5 px-1 mb-1">
          <MapPin className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Location
          </span>
        </div>
        <div className="space-y-0.5">
          {sceneLocations.length === 0 ? (
            <p className="text-xs text-text-muted px-3 py-1">Not set</p>
          ) : (
            sceneLocations.map((obj) => (
              <ObjectButton
                key={obj.id}
                obj={obj}
                inScene
                onClick={() => onSelectObject(obj.id, obj.source || "project")}
              />
            ))
          )}
          {allLocations
            .filter((o) => !locationIds.has(o.id))
            .map((obj) => (
              <div key={obj.id} className="flex items-center gap-1">
                <ObjectButton
                  obj={obj}
                  inScene={false}
                  onClick={() => onSelectObject(obj.id, obj.source || "project")}
                />
                {onAddRelationship && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0 opacity-60 hover:opacity-100"
                    title="Set as scene location"
                    disabled={addingRelationship === obj.id}
                    onClick={() => handleAddToScene(obj)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
        </div>
      </section>

      {/* Plotlines */}
      <section>
        <div className="flex items-center gap-1.5 px-1 mb-1">
          <GitBranch className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Plotlines
          </span>
          {activePlotlines.length > 0 && (
            <span className="text-xs text-accent ml-1">
              {activePlotlines.length} active
            </span>
          )}
        </div>
        <div className="space-y-0.5">
          {activePlotlines.length === 0 && otherPlotlines.length === 0 && (
            <p className="text-xs text-text-muted px-3 py-2">No plotlines yet</p>
          )}
          {activePlotlines.map((obj) => (
            <ObjectButton
              key={obj.id}
              obj={obj}
              inScene
              onClick={() => onSelectObject(obj.id, obj.source || "project")}
            />
          ))}
          {otherPlotlines.length > 0 && (
            <>
              <button
                onClick={() => setShowAllPlotlines((v) => !v)}
                className="flex items-center gap-1 px-3 py-1 text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                {showAllPlotlines ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {otherPlotlines.length} other{otherPlotlines.length !== 1 ? "s" : ""}
              </button>
              {showAllPlotlines &&
                otherPlotlines.map((obj) => (
                  <div key={obj.id} className="flex items-center gap-1">
                    <ObjectButton
                      obj={obj}
                      inScene={false}
                      onClick={() => onSelectObject(obj.id, obj.source || "project")}
                    />
                    {onAddRelationship && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0 opacity-60 hover:opacity-100"
                        title="Link plotline to scene"
                        disabled={addingRelationship === obj.id}
                        onClick={() => handleAddToScene(obj)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
