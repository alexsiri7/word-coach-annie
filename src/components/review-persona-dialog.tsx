"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ReviewPersonaDialogProps {
  open: boolean;
  onSelect: (persona: "editor" | "fan" | "author") => void;
  onCancel: () => void;
}

const PERSONAS: {
  value: "editor" | "fan" | "author";
  title: string;
  description: string;
}[] = [
  {
    value: "editor",
    title: "Editor / Publisher",
    description:
      "Commercial viability, structure, marketability, publication readiness",
  },
  {
    value: "fan",
    title: "Genre Fan",
    description: "Reader enjoyment, engagement, genre expectations",
  },
  {
    value: "author",
    title: "Professional Author",
    description:
      "Craft, prose quality, technique, storytelling mechanics",
  },
];

export function ReviewPersonaDialog({
  open,
  onSelect,
  onCancel,
}: ReviewPersonaDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Choose a reviewer perspective</DialogTitle>
          <DialogDescription>
            Pick the lens through which your manuscript will be evaluated.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          {PERSONAS.map(({ value, title, description }) => (
            <button
              key={value}
              onClick={() => onSelect(value)}
              className={cn(
                "w-full text-left rounded-lg border border-border/15 bg-surface-overlay px-4 py-3",
                "transition-all hover:bg-surface-raised hover:border-accent/40",
                "focus:outline-none focus:ring-2 focus:ring-accent/50"
              )}
            >
              <p className="text-sm font-semibold text-text-primary">{title}</p>
              <p className="text-xs text-text-muted mt-0.5">{description}</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
