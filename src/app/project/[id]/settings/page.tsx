"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Save, Check, PenLine, FileText, BookOpen, Braces, Archive } from "lucide-react";
import { offlineFetch } from "@/lib/offline/sync-queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface ProjectSettings {
  id: string;
  title: string;
  author: string;
  synopsis: string;
  genre: string;
}

interface ExportProgress {
  stage: "preparing" | "downloading" | "complete" | "error";
  bytesReceived: number;
  totalBytes: number | null;
  message: string;
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
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);

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
    const exportParams = buildExportParams();
    const sep = exportParams ? "&" : "";
    await downloadWithProgress(
      `/api/projects/${projectId}/export?type=${type}${sep}${exportParams}`,
      `${title || "export"}-${type}.md`,
      type,
    );
  };

  const downloadWithProgress = useCallback(async (
    url: string,
    filename: string,
    exportType: string,
  ) => {
    setExporting(exportType);
    setExportProgress({ stage: "preparing", bytesReceived: 0, totalBytes: null, message: "Preparing export..." });
    try {
      const res = await fetch(url);
      if (!res.ok) {
        setExportProgress({ stage: "error", bytesReceived: 0, totalBytes: null, message: "Export failed" });
        return;
      }

      const contentLength = res.headers.get("Content-Length");
      const totalBytes = contentLength ? parseInt(contentLength, 10) : null;

      if (!res.body) {
        // Fallback for browsers without ReadableStream support
        const blob = await res.blob();
        triggerDownload(blob, filename);
        setExportProgress({ stage: "complete", bytesReceived: blob.size, totalBytes: blob.size, message: formatBytes(blob.size) });
        return;
      }

      setExportProgress({ stage: "downloading", bytesReceived: 0, totalBytes, message: "Downloading..." });

      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytesReceived = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        bytesReceived += value.length;
        setExportProgress({
          stage: "downloading",
          bytesReceived,
          totalBytes,
          message: totalBytes
            ? `${formatBytes(bytesReceived)} / ${formatBytes(totalBytes)}`
            : formatBytes(bytesReceived),
        });
      }

      const blob = new Blob(chunks as BlobPart[]);
      triggerDownload(blob, filename);
      setExportProgress({ stage: "complete", bytesReceived, totalBytes: bytesReceived, message: formatBytes(bytesReceived) });
    } catch {
      setExportProgress({ stage: "error", bytesReceived: 0, totalBytes: null, message: "Export failed" });
    } finally {
      setExporting(null);
      setTimeout(() => setExportProgress(null), 3000);
    }
  }, []);

  const handleJsonExport = async () => {
    await downloadWithProgress(
      `/api/projects/${projectId}/export?type=json`,
      `${title || "export"}.json`,
      "json",
    );
  };

  const handleExportAll = async () => {
    await downloadWithProgress(
      "/api/projects/export-all",
      `annie-export-${new Date().toISOString().slice(0, 10)}.zip`,
      "export-all",
    );
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Export</h2>
            <Button
              onClick={handleJsonExport}
              disabled={!!exporting}
              className="gap-2"
            >
              {exporting === "json" ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export Project
            </Button>
          </div>

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

          {/* Export progress indicator */}
          {exportProgress && (
            <div className="mt-4 p-3 rounded-lg bg-surface-overlay/30 border border-border-subtle">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-text-secondary">
                  {exportProgress.stage === "complete" ? (
                    <span className="flex items-center gap-1.5 text-green-400">
                      <Check className="h-3.5 w-3.5" />
                      Download complete
                    </span>
                  ) : exportProgress.stage === "error" ? (
                    <span className="text-red-400">Export failed</span>
                  ) : (
                    exportProgress.message
                  )}
                </span>
                <span className="text-xs text-text-muted">{exportProgress.message}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    exportProgress.stage === "complete"
                      ? "bg-green-400"
                      : exportProgress.stage === "error"
                        ? "bg-red-400"
                        : exportProgress.stage === "downloading" && !exportProgress.totalBytes
                          ? "bg-accent animate-pulse w-2/3"
                          : "bg-accent"
                  }`}
                  style={
                    exportProgress.stage === "downloading" && !exportProgress.totalBytes
                      ? undefined
                      : {
                          width:
                            exportProgress.stage === "complete" || exportProgress.stage === "error"
                              ? "100%"
                              : exportProgress.totalBytes
                                ? `${Math.round((exportProgress.bytesReceived / exportProgress.totalBytes) * 100)}%`
                                : "5%",
                        }
                  }
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
