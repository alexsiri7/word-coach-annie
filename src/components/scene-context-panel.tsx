"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, MapPin, GitBranch, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StoryObject, Relationship } from "@/lib/types";

interface SceneContextPanelProps {
  projectId: string;
  sceneId: string;
  storyObjects: StoryObject[];
  onSelectObject: (objectId: string, objectType: string) => void;
}

interface ObjectGroup {
  label: string;
  icon: typeof Users;
  inScene: StoryObject[];
  others: StoryObject[];
}

export function SceneContextPanel({
  projectId,
  sceneId,
  storyObjects,
  onSelectObject,
}: SceneContextPanelProps) {
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOthers, setExpandedOthers] = useState<Set<string>>(new Set());

  const fetchRelationships = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/relationships`);
      if (res.ok) {
        const data = await res.json();
        setRelationships(data.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchRelationships();
  }, [fetchRelationships]);

  // Listen for new relationships created by @mentions
  useEffect(() => {
    const handler = () => fetchRelationships();
    window.addEventListener("scene-relationship-created", handler);
    return () => window.removeEventListener("scene-relationship-created", handler);
  }, [fetchRelationships]);

  // Find story object IDs linked to this scene via relationships
  const linkedObjectIds = new Set<string>();
  for (const rel of relationships) {
    const involvesScene =
      rel.fromNodeId === sceneId || rel.toNodeId === sceneId;
    if (involvesScene) {
      if (rel.fromObjectId) linkedObjectIds.add(rel.fromObjectId);
      if (rel.toObjectId) linkedObjectIds.add(rel.toObjectId);
    }
  }

  const buildGroup = (
    label: string,
    icon: typeof Users,
    types: string[]
  ): ObjectGroup => {
    const ofType = storyObjects.filter((o) => types.includes(o.type));
    const inScene = ofType.filter((o) => linkedObjectIds.has(o.id));
    const others = ofType.filter((o) => !linkedObjectIds.has(o.id));
    return { label, icon, inScene, others };
  };

  const groups: ObjectGroup[] = [
    buildGroup("Characters", Users, ["CHARACTER"]),
    buildGroup("Locations", MapPin, ["LOCATION"]),
    buildGroup("Plotlines", GitBranch, ["PLOTLINE"]),
  ];

  const toggleOthers = (label: string) => {
    setExpandedOthers((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="px-3 py-4 space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-1">
            <div className="h-3.5 w-20 bg-surface-overlay rounded" />
            <div className="h-7 w-full bg-surface-overlay/60 rounded" />
            <div className="h-7 w-4/5 bg-surface-overlay/60 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="px-2 py-2 space-y-3">
      {groups.map(({ label, icon: Icon, inScene, others }) => {
        const totalOthers = others.length;
        const showOthers = expandedOthers.has(label);

        if (inScene.length === 0 && totalOthers === 0) return null;

        return (
          <div key={label}>
            {/* Group header */}
            <div className="flex items-center gap-1.5 px-1 mb-1">
              <Icon className="h-3 w-3 text-text-muted" aria-hidden="true" />
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
                {label}
              </span>
              {inScene.length > 0 && (
                <span className="text-xs text-accent font-medium ml-auto">
                  {inScene.length}
                </span>
              )}
            </div>

            {/* Objects in this scene */}
            {inScene.length > 0 ? (
              <div className="space-y-0.5 mb-1">
                {inScene.map((obj) => (
                  <button
                    key={obj.id}
                    className="w-full text-left px-3 py-1.5 rounded-lg text-sm transition-all text-text-secondary hover:bg-surface-overlay/60 hover:text-text-primary"
                    onClick={() => onSelectObject(obj.id, obj.type)}
                  >
                    {obj.name}
                    {obj.role && (
                      <span className="text-xs text-text-muted ml-1">
                        {obj.role}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-3 text-xs text-text-muted italic mb-1">
                None in this scene
              </p>
            )}

            {/* Others toggle */}
            {totalOthers > 0 && (
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-full justify-start gap-1 px-3 text-xs text-text-muted hover:text-text-secondary"
                  onClick={() => toggleOthers(label)}
                  aria-expanded={showOthers}
                >
                  {showOthers ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  {totalOthers} other{totalOthers !== 1 ? "s" : ""}
                </Button>
                {showOthers && (
                  <div className="space-y-0.5 ml-2">
                    {others.map((obj) => (
                      <button
                        key={obj.id}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-sm transition-all text-text-muted hover:bg-surface-overlay/60 hover:text-text-secondary"
                        onClick={() => onSelectObject(obj.id, obj.type)}
                      >
                        {obj.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {groups.every((g) => g.inScene.length === 0 && g.others.length === 0) && (
        <p className="text-xs text-text-muted text-center py-4">
          No story objects linked to this scene yet.
          <br />
          Use @mentions while writing to link them.
        </p>
      )}
    </div>
  );
}
