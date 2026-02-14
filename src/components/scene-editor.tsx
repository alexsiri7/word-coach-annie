"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Save,
  Clock,
  Check,
  RotateCcw,
  Eye,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { cn } from "@/lib/utils";
import type { StructureNode, SceneStatus, ContentVersion } from "@/lib/types";

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

interface SceneEditorProps {
  node: StructureNode;
  projectId: string;
  onNodeUpdated: () => void;
}

export function SceneEditor({ node, projectId, onNodeUpdated }: SceneEditorProps) {
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(node.wordCount || 0);
  const [status, setStatus] = useState<SceneStatus>(node.status as SceneStatus);
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const [versionHistory, setVersionHistory] = useState<ContentVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<ContentVersion | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [versionToRestore, setVersionToRestore] = useState<ContentVersion | null>(null);
  const [restoring, setRestoring] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<string>("");

  // Load initial content
  useEffect(() => {
    fetch(`/api/nodes/${node.id}/content`)
      .then((res) => res.json())
      .then((data) => {
        setInitialContent(data.latest?.content || "");
        setVersionHistory(data.history || []);
        if (data.latest?.wordCount !== undefined) {
          setWordCount(data.latest.wordCount);
        }
      });
  }, [node.id]);

  const saveContent = useCallback(
    async (content: string) => {
      setSaving(true);
      try {
        await fetch(`/api/nodes/${node.id}/content`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        setLastSaved(new Date().toLocaleTimeString());
        onNodeUpdated();
      } finally {
        setSaving(false);
      }
    },
    [node.id, onNodeUpdated]
  );

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Underline,
        Placeholder.configure({
          placeholder: "Start writing your scene...",
        }),
      ],
      content: initialContent || "",
      editorProps: {
        attributes: {
          class: "prose-editor focus:outline-none min-h-full",
        },
      },
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        contentRef.current = html;

        const text = editor.state.doc.textContent;
        const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
        setWordCount(words);

        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          saveContent(html);
        }, 2000);
      },
    },
    [initialContent]
  );

  // Manual save
  const handleManualSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (contentRef.current) {
      saveContent(contentRef.current);
    }
  }, [saveContent]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Update scene status
  const handleStatusChange = async (newStatus: string) => {
    setStatus(newStatus as SceneStatus);
    await fetch(`/api/nodes/${node.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    onNodeUpdated();
  };

  // Load version history
  const loadVersionHistory = async () => {
    const res = await fetch(`/api/nodes/${node.id}/content`);
    const data = await res.json();
    setVersionHistory(data.history || []);
    setShowVersions(!showVersions);
    // Clear preview when toggling
    if (showVersions) {
      setPreviewVersion(null);
      setPreviewContent(null);
    }
  };

  // Preview a version
  const handlePreviewVersion = async (version: ContentVersion) => {
    if (previewVersion?.id === version.id) {
      // Toggle off
      setPreviewVersion(null);
      setPreviewContent(null);
      return;
    }

    setLoadingPreview(true);
    setPreviewVersion(version);

    try {
      const res = await fetch(`/api/nodes/${node.id}/content?versionId=${version.id}`);
      const data = await res.json();
      setPreviewContent(data.content || "");
    } catch {
      setPreviewContent("Failed to load version content.");
    } finally {
      setLoadingPreview(false);
    }
  };

  // Restore a version via the API
  const handleRestoreVersion = async () => {
    if (!versionToRestore) return;
    setRestoring(true);

    try {
      const res = await fetch(`/api/nodes/${node.id}/content`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: versionToRestore.id }),
      });

      if (res.ok) {
        const restored = await res.json();
        // Update editor with restored content
        if (editor) {
          editor.commands.setContent(restored.content);
          contentRef.current = restored.content;
        }
        setLastSaved(new Date().toLocaleTimeString());
        setPreviewVersion(null);
        setPreviewContent(null);
        setShowVersions(false);
        onNodeUpdated();

        // Reload version history
        const histRes = await fetch(`/api/nodes/${node.id}/content`);
        const histData = await histRes.json();
        setVersionHistory(histData.history || []);
      }
    } finally {
      setRestoring(false);
      setRestoreDialogOpen(false);
      setVersionToRestore(null);
    }
  };

  if (initialContent === null) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-surface-raised">
        <div className="flex items-center gap-0.5 mr-3">
          {[
            { icon: Bold, action: () => editor?.chain().focus().toggleBold().run(), active: editor?.isActive("bold") },
            { icon: Italic, action: () => editor?.chain().focus().toggleItalic().run(), active: editor?.isActive("italic") },
            { icon: UnderlineIcon, action: () => editor?.chain().focus().toggleUnderline().run(), active: editor?.isActive("underline") },
          ].map(({ icon: Icon, action, active }, i) => (
            <Button
              key={i}
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", active && "bg-accent/15 text-accent")}
              onClick={action}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
        </div>

        <div className="w-px h-5 bg-border mx-1" />

        <div className="flex items-center gap-0.5 mr-3">
          {[
            { icon: Heading1, action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), active: editor?.isActive("heading", { level: 1 }) },
            { icon: Heading2, action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), active: editor?.isActive("heading", { level: 2 }) },
            { icon: Heading3, action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), active: editor?.isActive("heading", { level: 3 }) },
          ].map(({ icon: Icon, action, active }, i) => (
            <Button
              key={i}
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", active && "bg-accent/15 text-accent")}
              onClick={action}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
        </div>

        <div className="w-px h-5 bg-border mx-1" />

        <div className="flex items-center gap-0.5">
          {[
            { icon: List, action: () => editor?.chain().focus().toggleBulletList().run(), active: editor?.isActive("bulletList") },
            { icon: ListOrdered, action: () => editor?.chain().focus().toggleOrderedList().run(), active: editor?.isActive("orderedList") },
            { icon: Quote, action: () => editor?.chain().focus().toggleBlockquote().run(), active: editor?.isActive("blockquote") },
          ].map(({ icon: Icon, action, active }, i) => (
            <Button
              key={i}
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", active && "bg-accent/15 text-accent")}
              onClick={action}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
        </div>

        <div className="w-px h-5 bg-border mx-1" />

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor?.chain().focus().undo().run()}>
          <Undo className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor?.chain().focus().redo().run()}>
          <Redo className="h-4 w-4" />
        </Button>

        <div className="flex-1" />

        {/* Status */}
        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="OUTLINE">Outline</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="REVISED">Revised</SelectItem>
            <SelectItem value="FINAL">Final</SelectItem>
          </SelectContent>
        </Select>

        {/* Save button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1.5 ml-2"
          onClick={handleManualSave}
          disabled={saving}
        >
          {saving ? (
            <div className="h-3 w-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          ) : lastSaved ? (
            <Check className="h-3 w-3 text-success" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          {saving ? "Saving..." : lastSaved ? `Saved` : "Save"}
        </Button>

        {/* Version history */}
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8 ml-1", showVersions && "bg-accent/15 text-accent")}
          onClick={loadVersionHistory}
          title="Version history"
        >
          <Clock className="h-4 w-4" />
        </Button>
      </div>

      {/* Version history panel */}
      {showVersions && (
        <div className="border-b border-border bg-surface-raised animate-slide-up">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs font-medium text-text-secondary">
                Version History
              </span>
              <span className="text-xs text-text-muted">
                ({versionHistory.length} version{versionHistory.length !== 1 ? "s" : ""})
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setShowVersions(false);
                setPreviewVersion(null);
                setPreviewContent(null);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="space-y-0.5 px-3 pb-3 max-h-48 overflow-y-auto">
            {versionHistory.length === 0 ? (
              <div className="text-xs text-text-muted py-3 text-center">No versions saved yet</div>
            ) : (
              versionHistory.map((v, i) => (
                <div
                  key={v.id}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all",
                    previewVersion?.id === v.id
                      ? "bg-accent/10 border border-accent/20"
                      : i === 0
                        ? "bg-surface-overlay/30"
                        : "hover:bg-surface-overlay/50"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-text-secondary whitespace-nowrap">
                      {timeAgo(v.createdAt)}
                    </span>
                    <span className="text-text-muted tabular-nums whitespace-nowrap">
                      {v.wordCount.toLocaleString()} words
                    </span>
                    {i === 0 && (
                      <span className="tag-pill text-accent text-[10px] py-0">Current</span>
                    )}
                  </div>

                  {i > 0 && (
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] px-2 gap-1 text-text-muted hover:text-text-primary"
                        onClick={() => handlePreviewVersion(v)}
                      >
                        <Eye className="h-3 w-3" />
                        {previewVersion?.id === v.id ? "Hide" : "Preview"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] px-2 gap-1 text-accent hover:text-accent-hover"
                        onClick={() => {
                          setVersionToRestore(v);
                          setRestoreDialogOpen(true);
                        }}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Version preview */}
          {previewVersion && (
            <div className="border-t border-border px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                  <Eye className="h-3 w-3 text-accent" />
                  Preview: {timeAgo(previewVersion.createdAt)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] px-2 gap-1 text-accent"
                  onClick={() => {
                    setVersionToRestore(previewVersion);
                    setRestoreDialogOpen(true);
                  }}
                >
                  <RotateCcw className="h-3 w-3" />
                  Restore this version
                </Button>
              </div>
              <div className="version-preview-content rounded-lg bg-surface-sunken border border-border-subtle p-4 max-h-64 overflow-y-auto">
                {loadingPreview ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div
                    className="text-sm text-text-secondary leading-relaxed prose-preview"
                    dangerouslySetInnerHTML={{ __html: previewContent || "" }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-y-auto tiptap-editor">
        <EditorContent editor={editor} className="h-full" />
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-surface-raised text-xs text-text-muted">
        <span className="tabular-nums">{wordCount.toLocaleString()} words</span>
        {lastSaved && (
          <span className="flex items-center gap-1">
            <Check className="h-3 w-3 text-success" />
            Last saved {lastSaved}
          </span>
        )}
      </div>

      {/* Restore confirmation dialog */}
      <AlertDialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this version?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new version with the content from{" "}
              {versionToRestore ? timeAgo(versionToRestore.createdAt) : ""} ({versionToRestore?.wordCount.toLocaleString()} words).
              Your current content will be preserved in the version history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreVersion}
              disabled={restoring}
              className="gap-1.5"
            >
              {restoring ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {restoring ? "Restoring..." : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
