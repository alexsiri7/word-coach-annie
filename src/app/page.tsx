"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  MoreVertical,
  Trash2,
  Pencil,
  PenLine,
  Sparkles,
  Globe,
  ArrowRight,
  Target,
  Pen,
} from "lucide-react";
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
import {
  getGlobalLastEdited,
  getTodayWords,
  getDailyGoal,
  setDailyGoal,
  type LastEditedScene,
} from "@/lib/writing-session";

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

  // Session tracking state (localStorage, client-side only)
  const [lastEdited, setLastEdited] = useState<LastEditedScene | null>(null);
  const [todayWords, setTodayWords] = useState(0);
  const [dailyGoal, setDailyGoalState] = useState(500);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  const fetchProjects = async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data.projects);
    setLoading(false);
  };

  useEffect(() => {
    fetchProjects();
    // Load session data from localStorage
    setLastEdited(getGlobalLastEdited());
    setTodayWords(getTodayWords());
    const goal = getDailyGoal();
    setDailyGoalState(goal);
    setGoalInput(String(goal));
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

  const handleSaveGoal = () => {
    const g = parseInt(goalInput, 10);
    if (g > 0) {
      setDailyGoal(g);
      setDailyGoalState(g);
    }
    setEditingGoal(false);
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

  // Resume card: show if edited in last 7 days
  const showResumeCard =
    lastEdited && Date.now() - lastEdited.ts < 7 * 24 * 60 * 60 * 1000;

  // Session bar: show if user has written today or has a goal set
  const goalPct = dailyGoal > 0 ? Math.min(100, Math.round((todayWords / dailyGoal) * 100)) : 0;
  const showSessionBar = todayWords > 0 || dailyGoal !== 500;

  return (
    <main id="main-content" className="min-h-screen">
      <SetupWizard />
      {/* Accent gradient line at top */}
      <div className="h-1 accent-gradient" />

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
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
        {showResumeCard && lastEdited && (
          <div
            className="glass-card p-4 mb-4 flex items-center gap-4 cursor-pointer group border-accent/20 hover:border-accent/40 transition-colors animate-fade-in"
            onClick={() => router.push(`/project/${lastEdited.projectId}`)}
          >
            <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
              <Pen className="h-5 w-5 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-muted mb-0.5">Continue writing</p>
              <p className="font-medium text-text-primary truncate">
                {lastEdited.sceneTitle}
              </p>
              {lastEdited.projectTitle && (
                <p className="text-xs text-text-muted truncate">
                  in {lastEdited.projectTitle} · {formatWordCount(lastEdited.wordCount)} words
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 flex-shrink-0 group-hover:text-accent"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/project/${lastEdited.projectId}`);
              }}
            >
              Open
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Session Progress Bar */}
        {showSessionBar && (
          <div className="glass-card p-4 mb-6 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium text-text-primary">
                  Today: {todayWords.toLocaleString()} words
                </span>
                {goalPct >= 100 && (
                  <span className="text-xs text-accent font-medium">Goal reached!</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {editingGoal ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      value={goalInput}
                      onChange={(e) => setGoalInput(e.target.value)}
                      className="h-7 w-20 text-xs"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveGoal();
                        if (e.key === "Escape") setEditingGoal(false);
                      }}
                    />
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={handleSaveGoal}>
                      Save
                    </Button>
                  </div>
                ) : (
                  <button
                    className="text-xs text-text-muted hover:text-text-primary transition-colors"
                    onClick={() => {
                      setGoalInput(String(dailyGoal));
                      setEditingGoal(true);
                    }}
                  >
                    Goal: {dailyGoal.toLocaleString()} words
                  </button>
                )}
              </div>
            </div>
            <div className="h-1.5 bg-surface-overlay rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${goalPct}%` }}
              />
            </div>
          </div>
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
                className="group glass-card p-5 cursor-pointer animate-slide-up flex flex-col"
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
                    <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                      <span>
                        {project.draftedScenes}/{project.totalScenes} scenes drafted
                      </span>
                      <span>
                        {Math.round((project.draftedScenes / project.totalScenes) * 100)}%
                      </span>
                    </div>
                    <div className="h-1 bg-surface-overlay rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent/60 rounded-full"
                        style={{
                          width: `${(project.draftedScenes / project.totalScenes) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 mt-3 text-xs text-text-muted">
                  {project.genre && (
                    <span className="tag-pill">{project.genre}</span>
                  )}
                  <span className="tabular-nums">{formatWordCount(project.wordCount)} words</span>
                  <span className="ml-auto">{formatDate(project.updatedAt)}</span>
                </div>

                {/* Next unwritten scene */}
                {project.nextUnwrittenScene && (
                  <button
                    className="mt-2 text-xs text-accent hover:underline text-left truncate"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/project/${project.id}`);
                    }}
                  >
                    Next: {project.nextUnwrittenScene.title} →
                  </button>
                )}
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
