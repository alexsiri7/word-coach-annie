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
  Lightbulb,
  ArrowRight,
  BookText,
  CirclePlus,
  Archive,
  ArchiveRestore,
  Download,
  ChevronDown,
  ChevronRight,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SetupWizard } from "@/components/setup-wizard";
import { WritingHeatmap } from "@/components/writing-heatmap";
import type { ProjectType } from "@/lib/types";

interface Project {
  id: string;
  title: string;
  author: string;
  synopsis: string;
  genre: string;
  projectType: ProjectType;
  wordCount: number;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  isSample?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeDate(dateStr: string) {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "Modified just now";
  if (diffH < 24) return `Modified ${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Modified yesterday";
  return `Modified ${formatDate(dateStr)}`;
}

function formatWordCount(count: number) {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState("");
  const [deleteExported, setDeleteExported] = useState(false);
  const [deleteCooldown, setDeleteCooldown] = useState(0);
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newSynopsis, setNewSynopsis] = useState("");
  const [newGenre, setNewGenre] = useState("");
  const [newProjectType, setNewProjectType] = useState<ProjectType>("FICTION");
  const [todayWords, setTodayWords] = useState(0);

  const fetchProjects = async () => {
    const [activeRes, archivedRes] = await Promise.all([
      fetch("/api/projects"),
      fetch("/api/projects?archived=true"),
    ]);
    const activeData = await activeRes.json();
    const archivedData = await archivedRes.json();

    // If user has no projects at all, seed the sample project
    if (activeData.projects.length === 0 && archivedData.projects.length === 0) {
      const seedRes = await fetch("/api/onboarding/sample", { method: "POST" });
      if (seedRes.status === 201) {
        // Re-fetch to include the newly created sample
        const [newActive, newArchived] = await Promise.all([
          fetch("/api/projects"),
          fetch("/api/projects?archived=true"),
        ]);
        const newActiveData = await newActive.json();
        const newArchivedData = await newArchived.json();
        setProjects(newActiveData.projects);
        setArchivedProjects(newArchivedData.projects);
        setLoading(false);
        return;
      }
    }

    setProjects(activeData.projects);
    setArchivedProjects(archivedData.projects);
    setLoading(false);
  };

  const fetchTodayWords = async () => {
    try {
      const res = await fetch("/api/sessions/heatmap");
      const data = await res.json();
      if (Array.isArray(data)) {
        const today = new Date().toISOString().slice(0, 10);
        const todayEntry = data.find((d: { date: string }) => d.date === today);
        setTodayWords(todayEntry?.wordsWritten ?? 0);
      }
    } catch {
      // Heatmap fetch failed — leave todayWords at 0
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchTodayWords();
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

  const handleArchive = async (project: Project) => {
    await offlineFetch(`/api/projects/${project.id}/archive`, { method: "POST" });
    fetchProjects();
  };

  const handleUnarchive = async (project: Project) => {
    await offlineFetch(`/api/projects/${project.id}/archive`, { method: "DELETE" });
    fetchProjects();
  };

  const handleExportAndDelete = async () => {
    if (!deleteTarget) return;
    // Trigger JSON export download
    const res = await fetch(`/api/projects/${deleteTarget.id}/export?type=json`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${deleteTarget.title.replace(/[^a-z0-9]/gi, "_")}_backup.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDeleteExported(true);
      // Start 30s cooldown
      setDeleteCooldown(30);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !deleteExported || deleteCooldown > 0) return;
    if (deleteConfirmTitle !== deleteTarget.title) return;
    await offlineFetch(`/api/projects/${deleteTarget.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmTitle: deleteConfirmTitle }),
    });
    setDeleteTarget(null);
    setDeleteConfirmTitle("");
    setDeleteExported(false);
    setDeleteCooldown(0);
    fetchProjects();
  };

  // Cooldown timer effect
  useEffect(() => {
    if (deleteCooldown <= 0) return;
    const timer = setTimeout(() => setDeleteCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [deleteCooldown]);

  /* Most recently updated project = hero candidate */
  const heroProject = projects.length > 0
    ? [...projects].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0]
    : null;

  /* Remaining projects (for Recent Projects grid) */
  const recentProjects = heroProject
    ? projects.filter((p) => p.id !== heroProject.id)
    : [];

  return (
    <main id="main-content" className="min-h-screen">
      <SetupWizard />

      {/* ── Top App Bar ─────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-surface">
        <div className="flex items-center justify-between w-full max-w-[1600px] mx-auto px-8 py-4">
          <div className="flex items-center gap-8">
            <span className="text-2xl font-headline italic font-bold text-text-primary">
              Annie
            </span>
            <nav className="hidden md:flex items-center space-x-6">
              <button
                onClick={() => router.push("/universe")}
                className="font-headline italic text-text-muted font-medium tracking-tight leading-relaxed hover:text-text-primary transition-colors duration-200"
              >
                Universes
              </button>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* ── Main Content ──────────────────────────────────── */}
      <div className="max-w-[1600px] mx-auto">
        <div className="p-8 md:p-12 lg:p-16 max-w-5xl mx-auto">
          {loading ? (
            /* ── Loading skeleton ─────────────────────────── */
            <div className="space-y-14">
              <div className="glass-card p-12 animate-pulse">
                <div className="h-4 w-32 bg-surface-overlay rounded mb-4" />
                <div className="h-10 w-64 bg-surface-overlay rounded mb-6" />
                <div className="h-5 w-80 bg-surface-overlay rounded mb-8" />
                <div className="h-12 w-48 bg-surface-overlay rounded" />
              </div>
              <div className="grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 glass-card p-8 animate-pulse">
                  <div className="h-6 w-60 bg-surface-overlay rounded mb-4" />
                  <div className="h-12 w-full bg-surface-overlay rounded" />
                </div>
                <div className="glass-card p-8 animate-pulse">
                  <div className="h-6 w-40 bg-surface-overlay rounded mb-4" />
                  <div className="h-24 w-full bg-surface-overlay rounded" />
                </div>
              </div>
            </div>
          ) : projects.length === 0 ? (
            /* ── Empty State ──────────────────────────────── */
            <div className="animate-fade-in max-w-2xl mx-auto py-16">
              <div className="text-center mb-12">
                <div className="h-20 w-20 bg-accent-muted flex items-center justify-center mx-auto mb-6">
                  <Sparkles className="h-9 w-9 text-accent" />
                </div>
                <h2 className="font-headline text-3xl text-text-primary mb-3">
                  Welcome to Annie!
                </h2>
                <p className="text-text-secondary max-w-md mx-auto leading-relaxed">
                  Your AI-powered writing assistant. Organize your stories, articles, and ideas
                  with smart tools that help you write better.
                </p>
              </div>

              <button
                onClick={() => setCreateOpen(true)}
                className="w-full glass-card p-6 mb-10 group cursor-pointer text-left border-2 border-dashed border-accent/30 hover:border-accent/60 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 bg-accent-muted flex items-center justify-center flex-shrink-0 group-hover:bg-accent/25 transition-colors">
                    <Plus className="h-6 w-6 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-text-primary group-hover:text-accent transition-colors">
                      Create Your First Project
                    </h3>
                    <p className="text-sm text-text-muted mt-0.5">
                      Start writing -- it only takes a few seconds to set up.
                    </p>
                  </div>
                </div>
              </button>

              <div>
                <h3 className="label-md text-text-muted mb-4 text-center">
                  What can you create?
                </h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <PenLine className="h-4 w-4 text-accent" />
                      <h4 className="font-medium text-text-primary text-sm">Fiction</h4>
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed">
                      Novels, short stories, and screenplays. Organize chapters, track characters, and plot threads.
                    </p>
                  </div>
                  <div className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Globe className="h-4 w-4 text-accent" />
                      <h4 className="font-medium text-text-primary text-sm">Article Collection</h4>
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed">
                      Blog posts, essays, and non-fiction. Group related pieces and maintain a consistent voice.
                    </p>
                  </div>
                  <div className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-accent" />
                      <h4 className="font-medium text-text-primary text-sm">General</h4>
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed">
                      Notes, journals, and freeform writing. A flexible workspace for any kind of project.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── Dashboard Content ────────────────────────── */
            <div className="animate-fade-in">
              {/* ── Sample Project Banner ─────────────────── */}
              {projects.some((p) => p.isSample) && (
                <div className="mb-6 bg-accent/10 border border-accent/20 p-4 rounded-lg flex items-center justify-between">
                  <p className="text-sm text-text-secondary">
                    <span className="font-semibold text-text-primary">This is a sample project to show you around.</span>{" "}
                    Edit it or delete it when you&apos;re ready.
                  </p>
                  <button
                    onClick={() => setCreateOpen(true)}
                    className="text-sm font-medium text-accent hover:text-accent/80 transition-colors whitespace-nowrap ml-4"
                  >
                    Create your own project
                  </button>
                </div>
              )}

              {/* ── Hero: Current Manuscript ────────────────── */}
              {heroProject && (
                <section className="mb-14">
                  <div
                    className="grid md:grid-cols-2 gap-12 items-center bg-surface-container-low p-8 md:p-12 rounded-lg relative overflow-hidden group cursor-pointer"
                    onClick={() => router.push(`/project/${heroProject.id}`)}
                  >
                    <div className="relative z-10">
                      <span className="font-label text-xs uppercase tracking-[0.2em] text-accent mb-4 block">
                        Current Manuscript
                      </span>
                      <h1 className="font-headline text-4xl md:text-5xl mb-6 leading-tight text-text-primary">
                        {heroProject.title}
                      </h1>
                      {heroProject.synopsis && (
                        <p className="font-headline italic text-xl text-on-surface-variant mb-8 max-w-md line-clamp-3">
                          &ldquo;{heroProject.synopsis}&rdquo;
                        </p>
                      )}
                      <button
                        className="bg-primary text-primary-foreground px-10 py-4 flex items-center gap-3 shadow-[4px_4px_0px_hsl(var(--text-secondary))] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all duration-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/project/${heroProject.id}`);
                        }}
                      >
                        <span className="font-label font-bold uppercase tracking-widest text-sm">
                          Continue Writing
                        </span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                    {/* Manuscript page preview decoration */}
                    <div className="hidden md:block relative h-64">
                      <div className="absolute inset-0 bg-surface-container-highest rounded-sm border-l-8 border-primary rotate-3 shadow-xl p-8 transition-transform group-hover:rotate-0 duration-500">
                        <div className="space-y-4 opacity-40">
                          <div className="h-2 bg-on-surface w-full" />
                          <div className="h-2 bg-on-surface w-3/4" />
                          <div className="h-2 bg-on-surface w-5/6" />
                          <div className="h-2 bg-on-surface w-2/3" />
                          <div className="h-2 bg-on-surface w-full" />
                          <div className="h-2 bg-on-surface w-1/2" />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* ── Bento Grid: Session + Annie's Edge ───────── */}
              <div className="grid lg:grid-cols-3 gap-8 mb-14">
                {/* Today's Writing Session */}
                <div className="lg:col-span-2 bg-surface-container-lowest p-8 border border-outline-variant/10 shadow-sm">
                  <div className="flex justify-between items-end mb-8">
                    <div>
                      <h2 className="font-headline text-3xl mb-1 text-text-primary">
                        Today&apos;s Writing Session
                      </h2>
                      <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                        Momentum is your only friend
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-headline text-4xl block text-text-primary">
                        {formatWordCount(todayWords)}
                      </span>
                      <span className="font-label text-[10px] uppercase tracking-tighter opacity-50">
                        Words today
                      </span>
                    </div>
                  </div>
                  {/* Typewriter-style progress bar */}
                  <div className="relative h-12 bg-surface-container mb-4 flex items-center px-1 overflow-hidden">
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-accent/10 transition-all duration-700"
                      style={{ width: `${Math.min(100, (todayWords / 2000) * 100)}%` }}
                    />
                    <div className="flex gap-1 flex-wrap relative">
                      {Array.from({ length: Math.min(10, Math.ceil(todayWords / 200)) }).map((_, i, arr) => (
                        <div
                          key={i}
                          className={`h-6 bg-primary ${
                            i === arr.length - 1 ? "w-1 animate-pulse" : i % 3 === 0 ? "w-1.5" : "w-2"
                          } ${i >= arr.length - 2 ? "opacity-40" : "opacity-80"}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-between font-label text-[10px] uppercase font-bold tracking-tighter text-on-surface-variant">
                    <span>{projects.length} project{projects.length !== 1 ? "s" : ""}</span>
                    <span className="text-accent">
                      {formatWordCount(todayWords)} words today
                    </span>
                  </div>
                </div>

                {/* Annie's Edge coaching card */}
                <div className="coaching-card-intense flex flex-col justify-between relative overflow-hidden p-8">
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-4">
                      <Lightbulb className="h-4 w-4" />
                      <span className="font-label text-xs uppercase font-extrabold tracking-widest">
                        Annie&apos;s Edge
                      </span>
                    </div>
                    <blockquote className="font-headline italic text-2xl leading-tight">
                      &ldquo;If you don&apos;t write 200 words in the next 10 minutes, I might have to&hellip; remind you again!&rdquo;
                    </blockquote>
                  </div>
                  {/* Decorative ink splash */}
                  <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-on-tertiary-container opacity-5 rounded-full blur-3xl" />
                </div>
              </div>

              {/* ── Recent Projects ──────────────────────────── */}
              <div className="mb-14">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="font-headline text-3xl text-text-primary">Recent Projects</h2>
                  <button
                    onClick={() => router.push("/universe")}
                    className="font-label text-xs uppercase font-bold tracking-widest text-text-primary border-b border-primary pb-1 hover:text-accent transition-colors"
                  >
                    View All
                  </button>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Project cards */}
                  {(recentProjects.length > 0 ? recentProjects : projects).map((project) => (
                    <div
                      key={project.id}
                      data-testid="project-card"
                      className="bg-surface-container-low p-6 group hover:bg-surface-container-high transition-colors cursor-pointer border-l-2 border-transparent hover:border-primary"
                      onClick={() => router.push(`/project/${project.id}`)}
                    >
                      <div className="flex justify-between items-start mb-6">
                        <BookText className="h-5 w-5 text-primary/40 group-hover:text-primary transition-colors" />
                        <div className="flex items-center gap-2">
                          <span className="font-label text-[10px] uppercase font-bold tracking-widest opacity-40">
                            {formatRelativeDate(project.updatedAt)}
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-surface-container rounded"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4 text-text-muted" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => router.push(`/project/${project.id}/settings`)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Settings
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-danger"
                                onClick={() => handleArchive(project)}
                              >
                                <Archive className="h-4 w-4 mr-2" />
                                Archive
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <h3 className="font-headline text-2xl mb-2 text-text-primary group-hover:text-primary transition-colors">
                        {project.title}
                      </h3>
                      <div className="flex items-center gap-2 mb-4 flex-wrap">
                        {project.genre && (
                          <span className="stamp-chip">{project.genre}</span>
                        )}
                        <span className="stamp-chip">
                          {formatWordCount(project.wordCount)} Words
                        </span>
                      </div>
                      {project.synopsis && (
                        <p className="font-body text-sm text-on-surface-variant line-clamp-2">
                          {project.synopsis}
                        </p>
                      )}
                    </div>
                  ))}

                  {/* Start a New Journey card */}
                  <div
                    className="border-2 border-dashed border-outline-variant flex flex-col items-center justify-center p-6 hover:bg-surface-container transition-colors group cursor-pointer min-h-[220px]"
                    onClick={() => setCreateOpen(true)}
                  >
                    <CirclePlus className="h-10 w-10 text-on-surface-variant mb-4 group-hover:scale-110 transition-transform" />
                    <span className="font-label text-xs uppercase font-extrabold tracking-widest text-on-surface-variant">
                      Start a New Journey
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Archived Projects ───────────────────────── */}
              {archivedProjects.length > 0 && (
                <div className="mb-14">
                  <button
                    onClick={() => setShowArchived(!showArchived)}
                    className="flex items-center gap-2 mb-6 text-text-muted hover:text-text-primary transition-colors"
                  >
                    {showArchived ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-label text-xs uppercase font-bold tracking-widest">
                      Archived ({archivedProjects.length})
                    </span>
                  </button>
                  {showArchived && (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {archivedProjects.map((project) => (
                        <div
                          key={project.id}
                          className="bg-surface-container-low p-6 group opacity-60 hover:opacity-100 transition-all border-l-2 border-transparent hover:border-outline-variant"
                        >
                          <div className="flex justify-between items-start mb-6">
                            <BookText className="h-5 w-5 text-text-muted/40" />
                            <div className="flex items-center gap-2">
                              <span className="stamp-chip text-[10px]">Archived</span>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-surface-container rounded"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreVertical className="h-4 w-4 text-text-muted" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenuItem onClick={() => handleUnarchive(project)}>
                                    <ArchiveRestore className="h-4 w-4 mr-2" />
                                    Restore
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-danger"
                                    onClick={() => {
                                      setDeleteTarget(project);
                                      setDeleteConfirmTitle("");
                                      setDeleteExported(false);
                                      setDeleteCooldown(0);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Permanently
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                          <h3 className="font-headline text-2xl mb-2 text-text-primary">
                            {project.title}
                          </h3>
                          <div className="flex items-center gap-2 mb-4 flex-wrap">
                            {project.genre && (
                              <span className="stamp-chip">{project.genre}</span>
                            )}
                            <span className="stamp-chip">
                              {formatWordCount(project.wordCount)} Words
                            </span>
                          </div>
                          {project.synopsis && (
                            <p className="font-body text-sm text-on-surface-variant line-clamp-2">
                              {project.synopsis}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Writing Heatmap ──────────────────────────── */}
              <WritingHeatmap />
            </div>
          )}
        </div>
      </div>

      {/* ── Floating Action Button ────────────────────────── */}
      <div className="fixed bottom-8 right-8 hidden lg:block">
        <button
          onClick={() => {
            if (heroProject) router.push(`/project/${heroProject.id}`);
            else setCreateOpen(true);
          }}
          className="bg-accent text-accent-foreground w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform group"
        >
          <PenLine className="h-5 w-5" />
          <div className="absolute right-full mr-4 bg-primary text-primary-foreground px-3 py-1 font-label text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Open Editor
          </div>
        </button>
      </div>

      {/* ── Create Project Dialog ──────────────────────────── */}
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

      {/* ── Safe Delete Dialog ─────────────────────────────── */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirmTitle("");
            setDeleteExported(false);
            setDeleteCooldown(0);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently Delete &ldquo;{deleteTarget?.title}&rdquo;?</DialogTitle>
            <DialogDescription>
              This will permanently delete the project and all its chapters, scenes, characters,
              and other data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteTarget && (
            <div className="space-y-4 py-2">
              {/* Stats */}
              <div className="bg-surface-container p-4 rounded-md space-y-1">
                <p className="text-sm text-text-secondary">
                  <strong>{formatWordCount(deleteTarget.wordCount)}</strong> words across{" "}
                  <strong>{deleteTarget.nodeCount}</strong> scenes
                </p>
              </div>

              {/* Step 1: Export */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-text-primary">
                  Step 1: Export a backup
                </p>
                {!deleteExported ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleExportAndDelete}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export JSON Backup
                  </Button>
                ) : (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Backup exported successfully.
                  </p>
                )}
              </div>

              {/* Step 2: Type name */}
              {deleteExported && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-text-primary">
                    Step 2: Type <strong>{deleteTarget.title}</strong> to confirm
                  </p>
                  <Input
                    value={deleteConfirmTitle}
                    onChange={(e) => setDeleteConfirmTitle(e.target.value)}
                    placeholder="Type the project title..."
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirmTitle("");
                setDeleteExported(false);
                setDeleteCooldown(0);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !deleteExported ||
                deleteConfirmTitle !== deleteTarget?.title ||
                deleteCooldown > 0
              }
              onClick={handleDelete}
            >
              {deleteCooldown > 0
                ? `Delete (${deleteCooldown}s)`
                : "Delete Forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
