"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, MoreVertical, Trash2, Pencil, PenLine, Sparkles, Globe, Play, Target, ArrowRight, BookOpen, Zap, Settings2 } from "lucide-react";
import { offlineFetch } from "@/lib/offline/sync-queue";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SetupWizard } from "@/components/setup-wizard";
import type { ProjectType } from "@/lib/types";

const RESUME_KEY = "writing-launchpad-resume";
const SESSION_KEY = "writing-launchpad-session";
const GOAL_KEY = "writing-launchpad-goal";

interface ResumeData {
  projectId: string;
  projectTitle: string;
  sceneId: string;
  sceneTitle: string;
  wordCount: number;
  timestamp: number;
  mode?: "editor" | "focus";
}

interface SessionData {
  date: string; // YYYY-MM-DD
  wordsAtStart: number;
  currentWords: number;
}

interface Project {
  id: string;
  title: string;
  author: string;
  synopsis: string;
  genre: string;
  projectType: ProjectType;
  wordCount: number;
  nodeCount: number;
  totalScenes: number;
  draftedScenes: number;
  nextUnwrittenScene: { id: string; title: string } | null;
  lastEditedScene: { id: string; title: string } | null;
  createdAt: string;
  updatedAt: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newSynopsis, setNewSynopsis] = useState("");
  const [newGenre, setNewGenre] = useState("");
  const [newProjectType, setNewProjectType] = useState<ProjectType>("FICTION");
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [dailyGoal, setDailyGoal] = useState<number>(0);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  const fetchProjects = async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data.projects);
    setLoading(false);
  };

  useEffect(() => {
    fetchProjects();

    // Load resume data
    try {
      const raw = localStorage.getItem(RESUME_KEY);
      if (raw) {
        const data = JSON.parse(raw) as ResumeData;
        // Only show if within 30 days
        if (Date.now() - data.timestamp < 30 * 24 * 60 * 60 * 1000) {
          setResume(data);
        }
      }
    } catch {
      // ignore
    }

    // Load session data
    try {
      const today = new Date().toISOString().split("T")[0];
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const data = JSON.parse(raw) as SessionData;
        if (data.date === today) {
          setSession(data);
        }
      }
    } catch {
      // ignore
    }

    // Load daily goal
    try {
      const goalRaw = localStorage.getItem(GOAL_KEY);
      if (goalRaw) setDailyGoal(parseInt(goalRaw, 10) || 0);
    } catch {
      // ignore
    }
  }, []);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    const res = await offlineFetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle,
        author: newAuthor,
        synopsis: newSynopsis,
        genre: newGenre,
        projectType: newProjectType,
      }),
    });
    if (res.ok) {
      const project = await res.json();
      setCreateOpen(false);
      setNewTitle("");
      setNewAuthor("");
      setNewSynopsis("");
      setNewGenre("");
      setNewProjectType("FICTION");
      router.push(`/project/${project.id}`);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await offlineFetch(`/api/projects/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    fetchProjects();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatWordCount = (count: number) => {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
  };

  const totalWords = projects.reduce((sum, p) => sum + p.wordCount, 0);

  const sessionWordsToday = session ? Math.max(0, session.currentWords - session.wordsAtStart) : 0;
  const goalPercent = dailyGoal > 0 ? Math.min(100, Math.round((sessionWordsToday / dailyGoal) * 100)) : 0;

  const dismissResume = () => {
    setResume(null);
    localStorage.removeItem(RESUME_KEY);
  };

  const handleSetGoal = () => {
    const val = parseInt(goalInput, 10);
    if (!isNaN(val) && val >= 0) {
      setDailyGoal(val);
      localStorage.setItem(GOAL_KEY, val.toString());
    }
    setGoalDialogOpen(false);
  };

  return (
    <main id="main-content" className="min-h-screen">
      <SetupWizard />
      {/* Accent gradient line at top */}
      <div className="h-1 accent-gradient" />

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-accent/15 flex items-center justify-center">
                <PenLine className="h-5 w-5 text-accent" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-text-primary">
                Word Coach Annie
              </h1>
            </div>
            <p className="text-text-muted ml-[52px]">
              {projects.length > 0
                ? `${projects.length} project${projects.length !== 1 ? "s" : ""} · ${formatWordCount(totalWords)} words total`
                : "Your writing projects"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => router.push("/universe")} className="gap-2">
              <Globe className="h-4 w-4" />
              Universes
            </Button>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              New Project
            </Button>
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>

        {/* Resume Card */}
        {!loading && resume && projects.some(p => p.id === resume.projectId) && (
          <div className="mb-6 glass-card p-5 border-l-4 border-l-accent animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
                  <Play className="h-4 w-4 text-accent" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-text-muted mb-0.5">Continue writing</p>
                  <p className="font-medium text-text-primary truncate">{resume.sceneTitle}</p>
                  <p className="text-xs text-text-muted truncate">
                    {resume.projectTitle} · {formatWordCount(resume.wordCount)} words
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(`/project/${resume.projectId}/scene/${resume.sceneId}/focus`)}
                  className="gap-1.5"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Focus
                </Button>
                <Button
                  size="sm"
                  onClick={() => router.push(`/project/${resume.projectId}?scene=${resume.sceneId}`)}
                  className="gap-1.5"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  Open
                </Button>
                <Button size="sm" variant="ghost" onClick={dismissResume} className="text-text-muted">
                  ×
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Session Tracker */}
        {!loading && projects.length > 0 && (
          dailyGoal > 0 ? (
            <div className="mb-6 glass-card p-4 animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium text-text-primary">Today&apos;s goal</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm tabular-nums text-text-muted">
                    {formatWordCount(sessionWordsToday)} / {formatWordCount(dailyGoal)} words
                    {goalPercent >= 100 && <span className="text-accent ml-1">✓</span>}
                  </span>
                  <button
                    onClick={() => { setGoalInput(dailyGoal.toString()); setGoalDialogOpen(true); }}
                    className="text-text-muted hover:text-text-primary"
                    aria-label="Edit goal"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="h-2 bg-surface-overlay rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-500"
                  style={{ width: `${goalPercent}%` }}
                />
              </div>
              {goalPercent > 0 && goalPercent < 100 && (
                <p className="text-xs text-text-muted mt-1">{goalPercent}% of daily goal</p>
              )}
            </div>
          ) : (
            <div className="mb-6 flex justify-end">
              <button
                onClick={() => { setGoalInput(""); setGoalDialogOpen(true); }}
                className="text-xs text-text-muted hover:text-accent flex items-center gap-1 transition-colors"
              >
                <Target className="h-3 w-3" />
                Set daily word goal
              </button>
            </div>
          )
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass-card p-5 animate-pulse">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="h-5 w-32 bg-surface-overlay rounded" />
                    <div className="h-3.5 w-20 bg-surface-overlay rounded mt-1.5" />
                  </div>
                </div>
                <div className="space-y-2 mt-1">
                  <div className="h-3.5 w-full bg-surface-overlay rounded" />
                  <div className="h-3.5 w-3/4 bg-surface-overlay rounded" />
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <div className="h-5 w-16 bg-surface-overlay rounded-full" />
                  <div className="h-3.5 w-20 bg-surface-overlay rounded" />
                  <div className="h-3.5 w-16 bg-surface-overlay rounded ml-auto" />
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-32 animate-fade-in">
            <div className="h-20 w-20 rounded-2xl bg-surface-raised border border-border flex items-center justify-center mx-auto mb-6">
              <Sparkles className="h-9 w-9 text-accent" />
            </div>
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              Start your story
            </h2>
            <p className="text-text-muted mb-8 max-w-sm mx-auto">
              Create your first writing project. Organize chapters, characters, and plotlines all in one place.
            </p>
            <Button onClick={() => setCreateOpen(true)} size="lg" className="gap-2">
              <Plus className="h-4 w-4" />
              Create Project
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 animate-fade-in">
            {projects.map((project, i) => (
              <div
                key={project.id}
                className="group glass-card p-5 cursor-pointer animate-slide-up"
                style={{ animationDelay: `${i * 50}ms`, animationFillMode: "backwards" }}
                onClick={() => router.push(`/project/${project.id}`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-text-primary truncate group-hover:text-accent transition-colors">
                      {project.title}
                    </h3>
                    {project.author && (
                      <p className="text-sm text-text-muted mt-0.5">by {project.author}</p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => router.push(`/project/${project.id}/settings`)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Settings
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-danger"
                        onClick={() => setDeleteTarget(project)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {project.synopsis && (
                  <p className="text-sm text-text-secondary mt-1 line-clamp-2 leading-relaxed">
                    {project.synopsis}
                  </p>
                )}

                {/* Manuscript progress bar */}
                {project.totalScenes > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-text-muted flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {project.draftedScenes}/{project.totalScenes} scenes drafted
                      </span>
                      <span className="text-xs text-text-muted">
                        {Math.round((project.draftedScenes / project.totalScenes) * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-surface-overlay rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent/70 rounded-full"
                        style={{ width: `${(project.draftedScenes / project.totalScenes) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Next unwritten scene */}
                {project.nextUnwrittenScene && (
                  <button
                    className="mt-2 text-xs text-accent hover:underline flex items-center gap-1 group/link"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/project/${project.id}?scene=${project.nextUnwrittenScene!.id}`);
                    }}
                  >
                    <ArrowRight className="h-3 w-3" />
                    Next: {project.nextUnwrittenScene.title}
                  </button>
                )}

                <div className="flex items-center gap-3 mt-4 text-xs text-text-muted">
                  {project.genre && (
                    <span className="tag-pill">{project.genre}</span>
                  )}
                  <span className="tabular-nums">{formatWordCount(project.wordCount)} words</span>
                  <span className="ml-auto">{formatDate(project.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Project Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>Create a new writing project.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-text-secondary">Title *</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="My Novel"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Type</label>
              <Select value={newProjectType} onValueChange={(v) => setNewProjectType(v as ProjectType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FICTION">Fiction</SelectItem>
                  <SelectItem value="ARTICLE_COLLECTION">Article Collection</SelectItem>
                  <SelectItem value="GENERAL">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Author</label>
              <Input
                value={newAuthor}
                onChange={(e) => setNewAuthor(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Genre</label>
              <Input
                value={newGenre}
                onChange={(e) => setNewGenre(e.target.value)}
                placeholder="e.g. Fantasy, Sci-Fi, Literary Fiction"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Synopsis</label>
              <Textarea
                value={newSynopsis}
                onChange={(e) => setNewSynopsis(e.target.value)}
                placeholder="Brief description of your project..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Daily Goal Dialog */}
      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Daily word goal</DialogTitle>
            <DialogDescription>Words written per session. Set to 0 to disable.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              type="number"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="e.g. 1000"
              autoFocus
              min={0}
              onKeyDown={(e) => e.key === "Enter" && handleSetGoal()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSetGoal}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the project and all its chapters, scenes, characters,
              and other data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-danger hover:bg-danger-hover"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
