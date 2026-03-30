"use client";

import { useState, useCallback, useEffect } from "react";
import { Sparkles, ChevronRight, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CritiqueItem {
  id: string;
  type: "critique" | "tip";
  text: string;
}

interface AnnieCritiquePanelProps {
  projectId: string;
  sceneId: string;
  sceneContent?: string;
  visible: boolean;
  onClose: () => void;
}

export function AnnieCritiquePanel({
  projectId,
  sceneId,
  sceneContent,
  visible,
  onClose,
}: AnnieCritiquePanelProps) {
  const [critiques, setCritiques] = useState<CritiqueItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCritique = useCallback(async () => {
    if (!sceneContent || sceneContent.trim().length < 50) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai/critique`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneId, content: sceneContent.slice(0, 2000) }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.critiques) setCritiques(data.critiques);
      }
    } catch {
      // AI critique is best-effort
    } finally {
      setLoading(false);
    }
  }, [projectId, sceneId, sceneContent]);

  // Fetch critique when panel becomes visible
  useEffect(() => {
    if (visible && critiques.length === 0 && !loading) {
      fetchCritique();
    }
  }, [visible, critiques.length, loading, fetchCritique]);

  if (!visible) return null;

  return (
    <div className="fixed right-6 top-1/2 -translate-y-1/2 w-72 z-40 animate-slide-in-right">
      <div className="glass-card p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/30">
          <span className="label-md text-text-primary font-bold">
            Annie&apos;s Critique
          </span>
          <div className="flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-text-muted hover:text-text-primary"
              onClick={onClose}
              aria-label="Close critique panel"
            >
              <XIcon className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : critiques.length > 0 ? (
            critiques.map((item) => (
              <div key={item.id} className="group relative">
                {item.type === "critique" ? (
                  <div className="relative pl-3">
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-destructive/60" />
                    <p className="text-xs leading-relaxed text-text-secondary">
                      {item.text}
                    </p>
                  </div>
                ) : (
                  <div className="coaching-card-positive p-3">
                    <p className="text-[11px] leading-snug text-text-secondary">
                      <span className="font-bold text-accent">Pro-Tip:</span>{" "}
                      {item.text}
                    </p>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="text-xs text-text-muted text-center py-4 italic font-editorial">
              Write a bit more and Annie will share her thoughts...
            </p>
          )}
        </div>

        {/* Action */}
        {critiques.length > 0 && (
          <div className="pt-2">
            <Button
              size="sm"
              className="w-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest h-8 gap-1.5"
              onClick={fetchCritique}
              disabled={loading}
            >
              Refresh Critique
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
