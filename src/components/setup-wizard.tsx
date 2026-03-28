"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  BookOpen,
  FileText,
  PenLine,
  Layers,
  Sparkles,
  Check,
} from "lucide-react";
import { offlineFetch } from "@/lib/offline/sync-queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ProjectType } from "@/lib/types";

const DISMISSED_KEY = "setup-wizard-dismissed";

type WritingType = "FICTION" | "ARTICLE_COLLECTION" | "GENERAL";

const WRITING_TYPES: { value: WritingType; label: string; description: string; icon: typeof BookOpen }[] = [
  {
    value: "FICTION",
    label: "Fiction",
    description: "Novels, short stories, screenplays — narrative writing with characters and plot",
    icon: BookOpen,
  },
  {
    value: "ARTICLE_COLLECTION",
    label: "Articles",
    description: "Blog posts, essays, journalism — informational writing organized by topic",
    icon: FileText,
  },
  {
    value: "GENERAL",
    label: "General",
    description: "Notes, research, anything else — flexible structure for any kind of writing",
    icon: Layers,
  },
];

const TEMPLATES: Record<WritingType, { label: string; description: string; chapters: string[] }[]> = {
  FICTION: [
    {
      label: "Novel",
      description: "Three-act structure with chapters and scenes",
      chapters: ["Act 1", "Act 2", "Act 3"],
    },
    {
      label: "Short Story",
      description: "Single arc — opening, conflict, resolution",
      chapters: ["Opening", "Conflict", "Resolution"],
    },
    {
      label: "Blank",
      description: "Start with an empty project",
      chapters: [],
    },
  ],
  ARTICLE_COLLECTION: [
    {
      label: "Blog Series",
      description: "A collection of related posts",
      chapters: ["Introduction", "Part 1", "Part 2", "Conclusion"],
    },
    {
      label: "Blank",
      description: "Start with an empty project",
      chapters: [],
    },
  ],
  GENERAL: [
    {
      label: "Blank",
      description: "Start with an empty project",
      chapters: [],
    },
  ],
};

export function SetupWizard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);

  // Step 0: writing type
  const [writingType, setWritingType] = useState<WritingType>("FICTION");
  // Step 1: project name
  const [projectName, setProjectName] = useState("");
  // Step 2: template
  const [templateIndex, setTemplateIndex] = useState(0);
  // Creating state
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) {
      setLoading(false);
      return;
    }
    fetch("/api/setup-status")
      .then((res) => res.json())
      .then((data) => {
        if (!data.setupComplete) setOpen(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setOpen(false);
  };

  const templates = TEMPLATES[writingType];

  const handleCreate = async () => {
    if (!projectName.trim()) return;
    setCreating(true);
    try {
      const template = templates[templateIndex];

      // Create the project
      const res = await offlineFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: projectName.trim(),
          projectType: writingType as ProjectType,
        }),
      });
      if (!res.ok) return;
      const project = await res.json();

      // Create chapters from template
      for (let i = 0; i < template.chapters.length; i++) {
        await offlineFetch(`/api/projects/${project.id}/nodes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: template.chapters[i], type: "CHAPTER", orderIndex: i }),
        }).catch(() => {});
      }

      setDone(true);
      localStorage.setItem(DISMISSED_KEY, "true");

      // Navigate to the project
      setTimeout(() => {
        setOpen(false);
        router.push(`/project/${project.id}`);
      }, 800);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleDismiss(); }}>
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()}>

        {/* Step 0: Choose writing type */}
        {step === 0 && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="h-10 w-10 rounded-xl bg-accent/15 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <DialogTitle className="text-xl">Welcome to Word Coach Annie</DialogTitle>
                  <DialogDescription className="mt-1">
                    What are you writing?
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-2 pt-2">
              {WRITING_TYPES.map(({ value, label, description, icon: Icon }) => (
                <button
                  key={value}
                  className={[
                    "w-full flex items-start gap-3 p-3.5 rounded-lg border text-left transition-colors",
                    writingType === value
                      ? "border-accent bg-accent/5"
                      : "border-border bg-surface-raised hover:border-accent/40",
                  ].join(" ")}
                  onClick={() => setWritingType(value)}
                >
                  <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">{label}</span>
                      {writingType === value && <Check className="h-3.5 w-3.5 text-accent" />}
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">{description}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3">
              <Button variant="ghost" onClick={handleDismiss} className="text-text-muted">
                Skip
              </Button>
              <Button onClick={() => setStep(1)} className="gap-1.5">
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {/* Step 1: Project name */}
        {step === 1 && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="h-10 w-10 rounded-xl bg-accent/15 flex items-center justify-center">
                  <PenLine className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <DialogTitle className="text-xl">Name your project</DialogTitle>
                  <DialogDescription className="mt-1">
                    You can always change this later.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="pt-2">
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={
                  writingType === "FICTION"
                    ? "e.g. The Last Horizon"
                    : writingType === "ARTICLE_COLLECTION"
                    ? "e.g. My Tech Blog"
                    : "e.g. Research Notes"
                }
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && projectName.trim() && setStep(2)}
                className="text-base"
              />
            </div>

            <div className="flex items-center justify-between pt-3">
              <Button variant="ghost" onClick={() => setStep(0)} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={() => setStep(2)} disabled={!projectName.trim()} className="gap-1.5">
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {/* Step 2: Template */}
        {step === 2 && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="h-10 w-10 rounded-xl bg-accent/15 flex items-center justify-center">
                  <Layers className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <DialogTitle className="text-xl">Choose a structure</DialogTitle>
                  <DialogDescription className="mt-1">
                    Pre-populate your project with a starter outline.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-2 pt-2">
              {templates.map((template, idx) => (
                <button
                  key={template.label}
                  className={[
                    "w-full flex items-start gap-3 p-3.5 rounded-lg border text-left transition-colors",
                    templateIndex === idx
                      ? "border-accent bg-accent/5"
                      : "border-border bg-surface-raised hover:border-accent/40",
                  ].join(" ")}
                  onClick={() => setTemplateIndex(idx)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">{template.label}</span>
                      {templateIndex === idx && <Check className="h-3.5 w-3.5 text-accent" />}
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">{template.description}</p>
                    {template.chapters.length > 0 && (
                      <p className="text-xs text-text-muted mt-1">
                        {template.chapters.join(" → ")}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3">
              <Button variant="ghost" onClick={() => setStep(1)} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
                {done ? (
                  <>
                    <Check className="h-4 w-4" />
                    Opening project&hellip;
                  </>
                ) : creating ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating&hellip;
                  </>
                ) : (
                  <>
                    Start writing
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
