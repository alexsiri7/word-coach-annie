"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Save, Check, PenLine, FileText, BookOpen, Braces, Archive, ArchiveRestore, Trash2, AlertTriangle } from "lucide-react";
import { offlineFetch } from "@/lib/offline/sync-queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface ProjectSettings {
  id: string;
  title: string;
  author: string;
  synopsis: string;
  genre: string;
  archivedAt: string | null;
  wordCount: number;
  sceneCount: number;
  characterCount: number;
  storyObjectCount: number;
  nodeCount: number;
}

export default function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;
  const router = useRouter();
  const [project, setProject] = useState<ProjectSettings | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [genre, setGenre] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Archive & delete
  const [archiving, setArchiving] = useState(false);
  const [showDeleteSection, setShowDeleteSection] = useState(false);
  const [deleteExported, setDeleteExported] = useState(false);
  const [deleteCooldown, setDeleteCooldown] = useState(0);
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Export options
  const [includeSynopsis, setIncludeSynopsis] = useState(true);
  const [includeSceneBreaks, setIncludeSceneBreaks] = useState(true);
  const [chapterNumbering, setChapterNumbering] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        setProject(data);
        setTitle(data.title || "");
        setAuthor(data.author || "");
        setSynopsis(data.synopsis || "");
        setGenre(data.genre || "");
      });
  }, [projectId]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await offlineFetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, author, synopsis, genre }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const buildExportParams = () => {
    const params = new URLSearchParams();
    if (!includeSynopsis) params.set("includeSynopsis", "false");
    if (!includeSceneBreaks) params.set("includeSceneBreaks", "false");
    if (!chapterNumbering) params.set("chapterNumbering", "false");
    return params.toString();
  };

  const handleExport = async (type: "manuscript" | "story-bible") => {
    setExporting(type);
    try {
      const exportParams = buildExportParams();
      const sep = exportParams ? "&" : "";
      const res = await fetch(`/api/projects/${projectId}/export?type=${type}${sep}${exportParams}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title || "export"}-${type}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(null);
    }
  };

  const handleJsonExport = async () => {
    setExporting("json");
    try {
      const res = await fetch(`/api/projects/${projectId}/export?type=json`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${title || "export"}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(null);
    }
  };

  const handleExportAll = async () => {
    setExporting("export-all");
    try {
      const res = await fetch("/api/projects/export-all");
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `annie-export-${new Date().toISOString().slice(0, 10)}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(null);
    }
  };

  const handleChapterExport = async () => {
    setExporting("chapters");
    try {
      const exportParams = buildExportParams();
      const sep = exportParams ? "&" : "";
      const res = await fetch(`/api/projects/${projectId}/export?type=chapters${sep}${exportParams}`);
      if (res.ok) {
        const data = await res.json();
        const chapters = data.chapters as { filename: string; content: string }[];

        if (chapters.length === 0) {
          return;
        }

        // Download each chapter as a separate file
        for (const chapter of chapters) {
          const blob = new Blob([chapter.content], { type: "text/markdown" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = chapter.filename;
          a.click();
          URL.revokeObjectURL(url);
          // Small delay between downloads to avoid browser blocking
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    } finally {
      setExporting(null);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    await offlineFetch(`/api/projects/${projectId}/archive`, { method: "POST" });
    const res = await fetch(`/api/projects/${projectId}`);
    const data = await res.json();
    setProject(data);
    setArchiving(false);
  };

  const handleUnarchive = async () => {
    setArchiving(true);
    await offlineFetch(`/api/projects/${projectId}/archive`, { method: "DELETE" });
    const res = await fetch(`/api/projects/${projectId}`);
    const data = await res.json();
    setProject(data);
    setArchiving(false);
    setShowDeleteSection(false);
    setDeleteExported(false);
    setDeleteCooldown(0);
    setDeleteConfirmTitle("");
  };

  const handleDeleteExport = async () => {
    const res = await fetch(`/api/projects/${projectId}/export?type=json`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-z0-9]/gi, "_")}_backup.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDeleteExported(true);
      setDeleteCooldown(30);
    }
  };

  const handleDeleteForever = async () => {
    if (!deleteExported || deleteCooldown > 0 || deleteConfirmTitle !== title) return;
    setDeleting(true);
    await offlineFetch(`/api/projects/${projectId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmTitle: deleteConfirmTitle }),
    });
    router.push("/");
  };

  // Cooldown timer
  useEffect(() => {
    if (deleteCooldown <= 0) return;
    const timer = setTimeout(() => setDeleteCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [deleteCooldown]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="h-1 accent-gradient" />
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push(`/project/${projectId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-accent" />
            <h1 className="text-xl font-semibold text-text-primary">Project Settings</h1>
          </div>
        </div>

        {/* Form */}
        <div className="glass-card p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Author</label>
            <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Genre</label>
            <Input value={genre} onChange={(e) => setGenre(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Synopsis</label>
            <Textarea value={synopsis} onChange={(e) => setSynopsis(e.target.value)} rows={4} />
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={saving || !title.trim()} className="gap-1.5">
              {saving ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : saved ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
            </Button>
          </div>
        </div>

        {/* Export */}
        <div className="glass-card p-6 mt-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Export</h2>

          {/* Export options */}
          <div className="mb-5 p-4 rounded-lg bg-surface-overlay/30 border border-border-subtle space-y-3">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Export Options</p>

            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={includeSynopsis}
                  onChange={(e) => setIncludeSynopsis(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 rounded-full bg-surface-overlay border border-border peer-checked:bg-accent/30 peer-checked:border-accent/50 transition-all" />
                <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-text-muted peer-checked:bg-accent peer-checked:translate-x-4 transition-all" />
              </div>
              <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
                Include synopses
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={includeSceneBreaks}
                  onChange={(e) => setIncludeSceneBreaks(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 rounded-full bg-surface-overlay border border-border peer-checked:bg-accent/30 peer-checked:border-accent/50 transition-all" />
                <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-text-muted peer-checked:bg-accent peer-checked:translate-x-4 transition-all" />
              </div>
              <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
                Scene break dividers
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={chapterNumbering}
                  onChange={(e) => setChapterNumbering(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 rounded-full bg-surface-overlay border border-border peer-checked:bg-accent/30 peer-checked:border-accent/50 transition-all" />
                <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-text-muted peer-checked:bg-accent peer-checked:translate-x-4 transition-all" />
              </div>
              <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
                Chapter numbering
              </span>
            </label>
          </div>

          {/* Export buttons */}
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Markdown</p>
          <div className="grid gap-3 sm:grid-cols-3 mb-4">
            <Button
              variant="outline"
              onClick={() => handleExport("manuscript")}
              disabled={!!exporting}
              className="gap-1.5 h-auto py-3 flex-col"
            >
              {exporting === "manuscript" ? (
                <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span className="text-xs">Full Manuscript</span>
            </Button>

            <Button
              variant="outline"
              onClick={handleChapterExport}
              disabled={!!exporting}
              className="gap-1.5 h-auto py-3 flex-col"
            >
              {exporting === "chapters" ? (
                <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <BookOpen className="h-4 w-4" />
              )}
              <span className="text-xs">Per Chapter</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => handleExport("story-bible")}
              disabled={!!exporting}
              className="gap-1.5 h-auto py-3 flex-col"
            >
              {exporting === "story-bible" ? (
                <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="text-xs">Story Bible</span>
            </Button>
          </div>

          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Data</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              variant="outline"
              onClick={handleJsonExport}
              disabled={!!exporting}
              className="gap-1.5 h-auto py-3 flex-col"
            >
              {exporting === "json" ? (
                <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <Braces className="h-4 w-4" />
              )}
              <span className="text-xs">JSON Export</span>
            </Button>

            <Button
              variant="outline"
              onClick={handleExportAll}
              disabled={!!exporting}
              className="gap-1.5 h-auto py-3 flex-col"
            >
              {exporting === "export-all" ? (
                <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              <span className="text-xs">Export All Projects (ZIP)</span>
            </Button>
          </div>
        </div>

        {/* Archive & Danger Zone */}
        <div className="glass-card p-6 mt-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Archive & Delete</h2>

          {!project.archivedAt ? (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Archiving hides this project from your dashboard. You can restore it any time from
                the Archived Projects section.
              </p>
              <Button
                variant="outline"
                onClick={handleArchive}
                disabled={archiving}
                className="gap-1.5"
              >
                {archiving ? (
                  <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                Archive Project
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="stamp-chip text-xs">Archived</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUnarchive}
                  disabled={archiving}
                  className="gap-1.5"
                >
                  {archiving ? (
                    <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <ArchiveRestore className="h-4 w-4" />
                  )}
                  Restore Project
                </Button>
              </div>

              {/* Danger zone: delete permanently */}
              <div className="border border-danger/30 rounded-md p-4 mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-danger" />
                  <h3 className="text-sm font-semibold text-danger">Danger Zone</h3>
                </div>

                {!showDeleteSection ? (
                  <div className="space-y-2">
                    <p className="text-sm text-text-secondary">
                      Permanently delete this project and all its data. This cannot be undone.
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowDeleteSection(true)}
                      className="gap-1.5"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Permanently
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Stats */}
                    <div className="bg-danger/5 border border-danger/20 p-3 rounded-md">
                      <p className="text-sm font-medium text-danger mb-1">
                        You are about to permanently delete:
                      </p>
                      <p className="text-sm text-text-secondary">
                        <strong>{(project.wordCount ?? 0).toLocaleString()}</strong> words across{" "}
                        <strong>{project.sceneCount ?? project.nodeCount ?? 0}</strong> scene{(project.sceneCount ?? project.nodeCount ?? 0) !== 1 ? "s" : ""}
                        {(project.characterCount ?? project.storyObjectCount ?? 0) > 0 && (
                          <> with <strong>{project.characterCount ?? project.storyObjectCount ?? 0}</strong> character{(project.characterCount ?? project.storyObjectCount ?? 0) !== 1 ? "s" : ""}</>
                        )}
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
                          size="sm"
                          onClick={handleDeleteExport}
                          className="gap-1.5"
                        >
                          <Download className="h-4 w-4" />
                          Export JSON Backup
                        </Button>
                      ) : (
                        <p className="text-sm text-green-600 dark:text-green-400">
                          Backup exported successfully.
                        </p>
                      )}
                    </div>

                    {/* Step 2: Confirm */}
                    {deleteExported && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-text-primary">
                          Step 2: Type <strong>{title}</strong> to confirm
                        </p>
                        <Input
                          value={deleteConfirmTitle}
                          onChange={(e) => setDeleteConfirmTitle(e.target.value)}
                          placeholder="Type the project title..."
                        />
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowDeleteSection(false);
                          setDeleteExported(false);
                          setDeleteCooldown(0);
                          setDeleteConfirmTitle("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={
                          !deleteExported ||
                          deleteConfirmTitle !== title ||
                          deleteCooldown > 0 ||
                          deleting
                        }
                        onClick={handleDeleteForever}
                      >
                        {deleting
                          ? "Deleting..."
                          : deleteCooldown > 0
                            ? `Delete Forever (${deleteCooldown}s)`
                            : "Delete Forever"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
