"use client";

import { useState, useEffect } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  PenLine,
  BookOpen,
  FileText,
  Layers,
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
import { useRouter } from "next/navigation";

const DISMISSED_KEY = "setup-wizard-dismissed";

type WritingMode = "FICTION" | "ARTICLE_COLLECTION" | "GENERAL";

interface WritingModeOption {
  value: WritingMode;
  icon: typeof BookOpen;
  label: string;
  description: string;
}

const WRITING_MODES: WritingModeOption[] = [
  {
    value: "FICTION",
    icon: BookOpen,
    label: "Fiction",
    description: "Novels, short stories, screenplays. Chapters, scenes, characters.",
  },
  {
    value: "ARTICLE_COLLECTION",
    icon: FileText,
    label: "Articles",
    description: "Blog posts, essays, journalism. Articles and sections.",
  },
  {
    value: "GENERAL",
    icon: Layers,
    label: "General",
    description: "Any other writing project. Flexible structure.",
  },
];

type Template = "novel" | "short-story" | "article";

interface TemplateOption {
  id: Template;
  label: string;
  description: string;
  modes: WritingMode[];
}

const TEMPLATES: TemplateOption[] = [
  {
    id: "novel",
    label: "Novel",
    description: "Chapter 1 → Scene 1 pre-populated. Add more as you go.",
    modes: ["FICTION"],
  },
  {
    id: "short-story",
    label: "Short Story",
    description: "Jump straight to Scene 1 — no chapters needed.",
    modes: ["FICTION"],
  },
  {
    id: "article",
    label: "Article / Post",
    description: "Single article with a section ready to write.",
    modes: ["ARTICLE_COLLECTION", "GENERAL"],
  },
];

export function SetupWizard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0); // 0=mode, 1=title, 2=template, 3=done
  const [loading, setLoading] = useState(true);

  const [writingMode, setWritingMode] = useState<WritingMode>("FICTION");
  const [projectTitle, setProjectTitle] = useState("");
  const [template, setTemplate] = useState<Template>("novel");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) {
      setLoading(false);
      return;
    }

    fetch("/api/setup-status")
      .then((res) => res.json())
      .then((data) => {
        if (!data.setupComplete) {
          setOpen(true);
        }
      })
      .catch(() => {
        // If we can't check, don't block the user
      })
      .finally(() => setLoading(false));
  }, []);

  const availableTemplates = TEMPLATES.filter((t) => t.modes.includes(writingMode));

  const handleSelectMode = (mode: WritingMode) => {
    setWritingMode(mode);
    // Reset template to first available for this mode
    const first = TEMPLATES.find((t) => t.modes.includes(mode));
    if (first) setTemplate(first.id);
  };

  const handleCreateAndStart = async () => {
    if (!projectTitle.trim()) return;
    setCreating(true);

    try {
      // Create project
      const projectRes = await offlineFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: projectTitle.trim(),
          projectType: writingMode,
        }),
      });
      if (!projectRes.ok) return;
      const project = await projectRes.json();

      // Create structure based on template
      let firstSceneId: string | null = null;

      if (template === "novel") {
        // Create Chapter 1
        const chapterRes = await offlineFetch(`/api/projects/${project.id}/nodes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "CHAPTER", title: "Chapter 1" }),
        });
        if (chapterRes.ok) {
          const chapter = await chapterRes.json();
          // Create Scene 1
          const sceneRes = await offlineFetch(`/api/projects/${project.id}/nodes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "SCENE", title: "Scene 1", parentId: chapter.id }),
          });
          if (sceneRes.ok) {
            const scene = await sceneRes.json();
            firstSceneId = scene.id;
          }
        }
      } else if (template === "short-story") {
        // Create Scene 1 directly
        const sceneRes = await offlineFetch(`/api/projects/${project.id}/nodes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "SCENE", title: "Scene 1" }),
        });
        if (sceneRes.ok) {
          const scene = await sceneRes.json();
          firstSceneId = scene.id;
        }
      } else if (template === "article") {
        // Create Article 1
        const articleRes = await offlineFetch(`/api/projects/${project.id}/nodes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "SCENE", title: "Article 1" }),
        });
        if (articleRes.ok) {
          const article = await articleRes.json();
          firstSceneId = article.id;
        }
      }

      setCreated(true);
      localStorage.setItem(DISMISSED_KEY, "true");

      // Navigate into focus mode for first scene, or the project
      setTimeout(() => {
        setOpen(false);
        if (firstSceneId) {
          router.push(`/project/${project.id}/scene/${firstSceneId}/focus`);
        } else {
          router.push(`/project/${project.id}`);
        }
      }, 600);
    } finally {
      setCreating(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setOpen(false);
  };

  if (loading) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleDismiss(); }}>
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()}>

        {/* Step 0: Choose writing mode */}
        {step === 0 && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="h-10 w-10 rounded-xl bg-accent/15 flex items-center justify-center">
                  <PenLine className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <DialogTitle className="text-xl">Welcome to Word Coach Annie</DialogTitle>
                  <DialogDescription className="mt-1">
                    What are you writing?
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="grid gap-2 pt-2">
              {WRITING_MODES.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => handleSelectMode(mode.value)}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                    writingMode === mode.value
                      ? "border-accent bg-accent/5"
                      : "border-border bg-surface-raised hover:border-accent/50"
                  }`}
                >
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    writingMode === mode.value ? "bg-accent/15" : "bg-surface-overlay"
                  }`}>
                    <mode.icon className={`h-4 w-4 ${writingMode === mode.value ? "text-accent" : "text-text-muted"}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{mode.label}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{mode.description}</p>
                  </div>
                  {writingMode === mode.value && (
                    <Check className="h-4 w-4 text-accent ml-auto flex-shrink-0 mt-0.5" />
                  )}
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
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder={writingMode === "FICTION" ? "My Novel" : writingMode === "ARTICLE_COLLECTION" ? "My Blog" : "My Project"}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && projectTitle.trim() && setStep(2)}
              />
            </div>

            <div className="flex items-center justify-between pt-3">
              <Button variant="ghost" onClick={() => setStep(0)} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={() => setStep(2)} disabled={!projectTitle.trim()} className="gap-1.5">
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
                  <DialogTitle className="text-xl">Pick a template</DialogTitle>
                  <DialogDescription className="mt-1">
                    We&apos;ll pre-populate your project so you can start writing immediately.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="grid gap-2 pt-2">
              {availableTemplates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                    template === t.id
                      ? "border-accent bg-accent/5"
                      : "border-border bg-surface-raised hover:border-accent/50"
                  }`}
                >
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-text-primary">{t.label}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{t.description}</p>
                  </div>
                  {template === t.id && (
                    <Check className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3">
              <Button variant="ghost" onClick={() => setStep(1)} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleCreateAndStart} disabled={creating || created} className="gap-1.5">
                {creating ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : created ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {creating ? "Creating..." : created ? "Done!" : "Start Writing"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
