"use client";

import { useState, useCallback } from "react";
import { AlertTriangle, X, RefreshCw, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

export interface ConsistencyAlert {
  id: string;
  type: "CHARACTER_ATTRIBUTE" | "PLOT_CONTRADICTION" | "TIMELINE" | "OTHER";
  severity: "high" | "medium" | "low";
  description: string;
  sceneId: string;
  sceneTitle: string;
  sourceSceneId?: string;
  sourceSceneTitle?: string;
  objectName?: string;
  dismissed?: boolean;
}

interface ConsistencyAlertsPanelProps {
  projectId: string;
  sceneId?: string;
  onClose: () => void;
  onAlertsLoaded?: (count: number) => void;
}

const TYPE_LABELS: Record<ConsistencyAlert["type"], string> = {
  CHARACTER_ATTRIBUTE: "Character",
  PLOT_CONTRADICTION: "Plot",
  TIMELINE: "Timeline",
  OTHER: "Other",
};

const SEVERITY_COLORS: Record<ConsistencyAlert["severity"], string> = {
  high: "text-destructive border-destructive/30 bg-destructive/5",
  medium: "text-amber-600 border-amber-300 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30",
  low: "text-muted-foreground border-border bg-muted/30",
};

export function ConsistencyAlertsPanel({ projectId, sceneId, onClose, onAlertsLoaded }: ConsistencyAlertsPanelProps) {
  const [alerts, setAlerts] = useState<ConsistencyAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const router = useRouter();

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/consistency-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Check failed (${res.status}). Please try again.`);
        return;
      }
      const data = await res.json();
      const newAlerts: ConsistencyAlert[] = data.alerts ?? [];
      setAlerts(newAlerts);
      onAlertsLoaded?.(newAlerts.filter((a) => !a.dismissed).length);
    } catch (err) {
      console.error("[consistency-alerts-panel] runCheck failed:", err);
      setError("Check failed. Please try again.");
    } finally {
      setLoading(false);
      setRan(true);
    }
  }, [projectId, sceneId, onAlertsLoaded]);

  const dismissAlert = (id: string) => {
    setAlerts((prev) => {
      const updated = prev.filter((a) => a.id !== id);
      onAlertsLoaded?.(updated.filter((a) => !a.dismissed).length);
      return updated;
    });
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleAlerts = alerts.filter((a) => !a.dismissed);

  return (
    <div className="flex flex-col h-full max-h-[400px] overflow-hidden rounded-lg border border-border bg-background shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20 shrink-0">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium">Consistency Alerts</span>
          {visibleAlerts.length > 0 && (
            <span className="text-xs bg-amber-500 text-white rounded-full px-1.5 py-0.5">
              {visibleAlerts.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={runCheck}
            disabled={loading}
            aria-label="Run consistency check"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!ran && !loading && (
          <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Analyze your story for character and plot inconsistencies.
            </p>
            <Button size="sm" onClick={runCheck}>
              Run Analysis
            </Button>
          </div>
        )}

        {loading && (
          <div className="p-4 flex items-center justify-center gap-2">
            <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">Analyzing story…</span>
          </div>
        )}

        {error && (
          <div className="p-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={runCheck}>Retry</Button>
          </div>
        )}

        {ran && !loading && !error && visibleAlerts.length === 0 && (
          <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground">No inconsistencies found.</p>
          </div>
        )}

        {visibleAlerts.length > 0 && (
          <ul className="divide-y divide-border/50">
            {visibleAlerts.map((alert) => {
              const isOpen = expanded.has(alert.id);
              return (
                <li key={alert.id} className={cn("border-l-2", {
                  "border-l-destructive": alert.severity === "high",
                  "border-l-amber-400": alert.severity === "medium",
                  "border-l-muted-foreground/30": alert.severity === "low",
                })}>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-muted/30 transition-colors flex items-start gap-2"
                    onClick={() => toggleExpand(alert.id)}
                    aria-expanded={isOpen}
                  >
                    <span className="mt-0.5 shrink-0">
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={cn(
                          "text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border",
                          SEVERITY_COLORS[alert.severity]
                        )}>
                          {TYPE_LABELS[alert.type]}
                        </span>
                        {alert.objectName && (
                          <span className="text-xs text-muted-foreground truncate">{alert.objectName}</span>
                        )}
                      </div>
                      <p className="text-xs text-foreground line-clamp-2">{alert.description}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); dismissAlert(alert.id); }}
                      aria-label="Dismiss alert"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 ml-6">
                      <p className="text-xs text-muted-foreground mb-2">{alert.description}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() =>
                            router.push(`/project/${projectId}/scene/${alert.sceneId}/focus`)
                          }
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Go to "{alert.sceneTitle}"
                        </Button>
                        {alert.sourceSceneId && alert.sourceSceneTitle && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              router.push(
                                `/project/${projectId}/scene/${alert.sourceSceneId}/focus`
                              )
                            }
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Go to source "{alert.sourceSceneTitle}"
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => dismissAlert(alert.id)}
                        >
                          Not an error
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
