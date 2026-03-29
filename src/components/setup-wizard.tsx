"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  BookOpen,
  FileText,
  PenLine,
  Sparkles,
  Loader2,
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

const DISMISSED_KEY = "setup-wizard-dismissed";

type WritingType = "FICTION" | "ARTICLE_COLLECTION" | "GENERAL";
type TemplateKey = "novel" | "short_story" | "article" | "blog_post" | "blank";

interface Template {
  key: TemplateKey;
  label: string;
  description: string;
}

const FICTION_TEMPLATES: Template[] = [
  { key: "novel", label: "Novel", description: "Chapters → Scenes structure" },
  { key: "short_story", label: "Short Story", description: "Single-scene structure" },
  { key: "blank", label: "Blank", description: "Start from scratch" },
];

const ARTICLE_TEMPLATES: Template[] = [
  { key: "article", label: "Article", description: "Section → Draft structure" },
  { key: "blog_post", label: "Blog Post", description: "Single draft" },
  { key: "blank", label: "Blank", description: "Start from scratch" },
];

const GENERAL_TEMPLATES: Template[] = [
  { key: "blank", label: "Blank", description: "Start from scratch" },
];

const WRITING_TYPES = [
  {
    type: "FICTION" as WritingType,
    icon: BookOpen,
    label: "Fiction",
    description: "Novels, short stories, screenplays",
  },
  {
    type: "ARTICLE_COLLECTION" as WritingType,
    icon: FileText,
    label: "Articles",
    description: "Blog posts, essays, journalism",
  },
  {
    type: "GENERAL" as WritingType,
    icon: PenLine,
    label: "General",
    description: "Notes, research, other writing",
  },
];

export function SetupWizard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0); // 0=type, 1=name+template, 2=creating
  const [loading, setLoading] = useState(true);

  const [writingType, setWritingType] = useState<WritingType>("FICTION");
  const [projectName, setProjectName] = useState("");
  const [template, setTemplate] = useState<TemplateKey>("novel");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) {
      setLoading(false);
      return;
    }
    // Show wizard for new users (no dismissed flag)
    setOpen(true);
    setLoading(false);
  }, []);

  const templates =
    writingType === "FICTION"
      ? FICTION_TEMPLATES
      : writingType === "ARTICLE_COLLECTION"
      ? ARTICLE_TEMPLATES
      : GENERAL_TEMPLATES;

  const handleTypeSelect = (type: WritingType) => {
    setWritingType(type);
    // Set default template for this type
    if (type === "FICTION") setTemplate("novel");
    else if (type === "ARTICLE_COLLECTION") setTemplate("article");
    else setTemplate("blank");
    setStep(1);
  };

  const handleCreate = async () => {
    if (!projectName.trim()) return;
    setCreating(true);

    try {
      // 1. Create project
      const projRes = await offlineFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: projectName.trim(), projectType: writingType }),
      });
      if (!projRes.ok) return;
      const project = await projRes.json();

      // 2. Create template structure
      let firstSceneId: string | null = null;

      if (template === "novel") {
        const chapRes = await offlineFetch(`/api/projects/${project.id}/nodes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "CHAPTER", title: "Chapter 1", orderIndex: 0 }),
        });
        if (chapRes.ok) {
          const chap = await chapRes.json();
          const sceneRes = await offlineFetch(`/api/projects/${project.id}/nodes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "SCENE", title: "Scene 1", parentId: chap.id, orderIndex: 0 }),
          });
          if (sceneRes.ok) {
            const scene = await sceneRes.json();
            firstSceneId = scene.id;
          }
        }
      } else if (template === "short_story") {
        const sceneRes = await offlineFetch(`/api/projects/${project.id}/nodes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "SCENE", title: "Scene 1", orderIndex: 0 }),
        });
        if (sceneRes.ok) {
          const scene = await sceneRes.json();
          firstSceneId = scene.id;
        }
      } else if (template === "article") {
        const chapRes = await offlineFetch(`/api/projects/${project.id}/nodes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "CHAPTER", title: "Article 1", orderIndex: 0 }),
        });
        if (chapRes.ok) {
          const chap = await chapRes.json();
          const sceneRes = await offlineFetch(`/api/projects/${project.id}/nodes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "SCENE", title: "Draft", parentId: chap.id, orderIndex: 0 }),
          });
          if (sceneRes.ok) {
            const scene = await sceneRes.json();
            firstSceneId = scene.id;
          }
        }
      } else if (template === "blog_post") {
        const sceneRes = await offlineFetch(`/api/projects/${project.id}/nodes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "SCENE", title: "Draft", orderIndex: 0 }),
        });
        if (sceneRes.ok) {
          const scene = await sceneRes.json();
          firstSceneId = scene.id;
        }
      }

      // 3. Mark wizard as done and navigate
      localStorage.setItem(DISMISSED_KEY, "true");
      setOpen(false);

      if (firstSceneId) {
        router.push(`/project/${project.id}/scene/${firstSceneId}/focus`);
      } else {
        router.push(`/project/${project.id}`);
      }
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

            <div className="grid gap-3 pt-2">
              {WRITING_TYPES.map(({ type, icon: Icon, label, description }) => (
                <button
                  key={type}
                  className="flex items-center gap-4 p-4 rounded-xl border border-border bg-surface-raised hover:border-accent/50 hover:bg-accent/5 transition-colors text-left group"
                  onClick={() => handleTypeSelect(type)}
                >
                  <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 group-hover:bg-accent/20 transition-colors">
                    <Icon className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <p className="font-medium text-text-primary">{label}</p>
                    <p className="text-sm text-text-muted">{description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-text-muted ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>

            <div className="pt-2 text-center">
              <button
                className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                onClick={handleDismiss}
              >
                Skip setup — I&apos;ll explore on my own
              </button>
            </div>
          </>
        )}

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
                    Choose a name and starting structure.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-5 pt-2">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Project title
                </label>
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder={
                    writingType === "FICTION"
                      ? "My Novel"
                      : writingType === "ARTICLE_COLLECTION"
                      ? "My Article Collection"
                      : "My Project"
                  }
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && projectName.trim() && handleCreate()}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Start with
                </label>
                <div className="grid gap-2">
                  {templates.map((t) => (
                    <button
                      key={t.key}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
                        template === t.key
                          ? "border-accent bg-accent/5 text-text-primary"
                          : "border-border bg-surface-raised text-text-secondary hover:border-accent/40"
                      }`}
                      onClick={() => setTemplate(t.key)}
                    >
                      <div
                        className={`h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 ${
                          template === t.key ? "border-accent bg-accent" : "border-border"
                        }`}
                      />
                      <div>
                        <span className="text-sm font-medium">{t.label}</span>
                        <span className="text-xs text-text-muted ml-2">{t.description}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(0)} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!projectName.trim() || creating}
                className="gap-1.5"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
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
