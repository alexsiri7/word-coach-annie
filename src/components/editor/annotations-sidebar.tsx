"use client";

import {
  MessageSquare,
  X,
  Check,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { timeAgo } from "./editor-config";
import type { Annotation } from "@/lib/types";

interface AnnotationsSidebarProps {
  annotations: Annotation[];
  onClose: () => void;
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
}

export function AnnotationsSidebar({
  annotations,
  onClose,
  onResolve,
  onDelete,
}: AnnotationsSidebarProps) {
  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className={cn(
        "flex flex-col animate-slide-in-right shrink-0 bg-surface-raised border-l border-border",
        "fixed inset-y-0 right-0 z-50 w-80 shadow-2xl",
        "md:relative md:shadow-none md:z-auto"
      )}>
        <div className="p-3 border-b border-border font-medium text-sm flex items-center justify-between bg-surface">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-accent" />
            <span>Annotations ({annotations.length})</span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {annotations.length === 0 ? (
            <div className="text-text-muted text-xs text-center py-4 flex flex-col items-center gap-2">
              <MessageSquare className="h-8 w-8 opacity-20" />
              <p>No annotations yet</p>
              <p className="opacity-70">Select text to add a comment</p>
            </div>
          ) : (
            annotations.map(a => (
              <div
                key={a.id}
                className={cn(
                  "bg-surface border rounded-lg p-3 text-sm shadow-sm group transition-all",
                  a.resolved
                    ? "border-border-subtle opacity-60 hover:opacity-100"
                    : "border-border hover:border-accent/40"
                )}
              >
                <div className="flex items-start gap-2 mb-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-5 w-5 mt-0.5 shrink-0 rounded-full border",
                      a.resolved
                        ? "bg-accent text-white border-accent hover:bg-accent-hover hover:border-accent-hover"
                        : "bg-transparent border-input hover:bg-accent/10 hover:border-accent text-transparent hover:text-accent/50"
                    )}
                    onClick={() => onResolve(a.id, !a.resolved)}
                    title={a.resolved ? "Mark as unresolved" : "Mark as resolved"}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <div className={cn("text-text-secondary whitespace-pre-wrap leading-relaxed flex-1", a.resolved && "line-through text-text-muted")}>
                    {a.content}
                  </div>
                </div>

                {a.selectedText && (
                  <div className="mb-2 pl-7">
                    <div className="bg-surface-sunken p-1.5 rounded text-xs text-text-muted italic truncate border border-border-subtle">
                      &quot;{a.selectedText}&quot;
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-text-muted pl-7">
                  <span>{timeAgo(a.createdAt)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 -mr-1 text-text-muted hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => onDelete(a.id)}
                    title="Delete annotation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
