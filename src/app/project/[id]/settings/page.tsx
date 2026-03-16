"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Save, Check, PenLine, FileText, BookOpen, Braces, Archive } from "lucide-react";
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
      </div>
    </main>
  );
}
