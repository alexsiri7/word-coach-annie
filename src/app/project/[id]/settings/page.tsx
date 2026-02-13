"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Project } from "@/lib/types";

export default function ProjectSettings() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [genre, setGenre] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        setProject(data);
        setTitle(data.title);
        setAuthor(data.author);
        setGenre(data.genre);
        setSynopsis(data.synopsis);
      });
  }, [projectId]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, author, genre, synopsis }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!project) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Project Settings</h1>
        </div>

        <div className="bg-white rounded-lg border p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
            <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Genre</label>
            <Input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="e.g. Fantasy" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Synopsis</label>
            <Textarea
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              rows={5}
              placeholder="Brief description of your project..."
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving || !title.trim()}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save"}
            </Button>
            {saved && <span className="text-sm text-green-600">Saved!</span>}
          </div>
        </div>

        <div className="mt-8 bg-white rounded-lg border p-6">
          <h2 className="text-lg font-semibold mb-2">Export</h2>
          <p className="text-sm text-gray-500 mb-4">
            Export your manuscript as Markdown for sharing with readers.
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => window.open(`/api/projects/${projectId}/export?format=full`, "_blank")}
            >
              Full Manuscript (.md)
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open(`/api/projects/${projectId}/export?format=bible`, "_blank")}
            >
              Story Bible (.md)
            </Button>
          </div>
        </div>

        <div className="mt-4 text-xs text-gray-400">
          Created: {new Date(project.createdAt).toLocaleDateString()} &middot;
          Last updated: {new Date(project.updatedAt).toLocaleDateString()}
        </div>
      </div>
    </main>
  );
}
