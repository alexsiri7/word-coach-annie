"use client";

import React, { useRef, useLayoutEffect, useEffect } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { LintResult } from "@/components/editor/extensions/harper-spellcheck";

interface HarperSuggestionPopoverProps {
  activeLint: LintResult | null;
  activeLintRect: DOMRect | null;
  onApply: (from: number, to: number, replacement: string) => void;
  onDismiss: () => void;
}

export function HarperSuggestionPopover({
  activeLint,
  activeLintRect,
  onApply,
  onDismiss,
}: HarperSuggestionPopoverProps) {
  const anchorRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (anchorRef.current && activeLintRect) {
      anchorRef.current.style.position = "fixed";
      anchorRef.current.style.top = `${activeLintRect.bottom}px`;
      anchorRef.current.style.left = `${activeLintRect.left}px`;
      anchorRef.current.style.width = `${activeLintRect.width}px`;
      anchorRef.current.style.height = "0";
      anchorRef.current.style.pointerEvents = "none";
    }
  }, [activeLintRect]);

  // Dismiss popover when the editor scrolls (so it doesn't drift from the underlined word)
  useEffect(() => {
    const editorEl = document.querySelector(".tiptap");
    if (!editorEl || !activeLint) return;
    editorEl.addEventListener("scroll", onDismiss, { once: true, passive: true });
    return () => editorEl.removeEventListener("scroll", onDismiss);
  }, [activeLint, onDismiss]);

  if (!activeLint || !activeLintRect) return null;

  return (
    <PopoverPrimitive.Root open onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <PopoverPrimitive.Anchor ref={anchorRef} asChild>
        <div aria-hidden />
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className={cn(
            "z-50 w-64 rounded-md border border-border bg-surface-raised p-3 text-text-primary shadow-md outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        >
          <p className="text-xs text-text-secondary mb-2">{activeLint.message}</p>
          {activeLint.suggestions.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {activeLint.suggestions.slice(0, 5).map((suggestion) => (
                <Button
                  key={suggestion}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    onApply(activeLint.from, activeLint.to, suggestion);
                    onDismiss();
                  }}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No suggestions available.</p>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-7 text-xs w-full"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
