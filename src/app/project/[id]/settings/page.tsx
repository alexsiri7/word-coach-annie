"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Save, Check, PenLine } from "lucide-react";
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
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, author, synopsis, genre }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleExport = async (type: "manuscript" | "story-bible") => {
    const res = await fetch(`/api/projects/${projectId}/export?type=${type}`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "export"}-${type}.md`;
      a.click();
      URL.revokeObjectURL(url);
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
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" onClick={() => handleExport("manuscript")} className="gap-1.5">
              <Download className="h-4 w-4" />
              Export Manuscript
            </Button>
            <Button variant="outline" onClick={() => handleExport("story-bible")} className="gap-1.5">
              <Download className="h-4 w-4" />
              Export Story Bible
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
