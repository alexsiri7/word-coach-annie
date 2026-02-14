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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { StructureNode, SceneStatus, ContentVersion } from "@/lib/types";
import { SCENE_STATUS_COLORS } from "@/lib/types";

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

  // Restore a version
  const handleRestoreVersion = async (version: ContentVersion) => {
    if (editor) {
      editor.commands.setContent(version.content);
      contentRef.current = version.content;
      await saveContent(version.content);
      setShowVersions(false);
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
          className="h-8 w-8 ml-1"
          onClick={() => {
            // Reload versions then toggle
            fetch(`/api/nodes/${node.id}/content`)
              .then((res) => res.json())
              .then((data) => {
                setVersionHistory(data.history || []);
                setShowVersions(!showVersions);
              });
          }}
        >
          <Clock className="h-4 w-4" />
        </Button>
      </div>

      {/* Version history panel */}
      {showVersions && versionHistory.length > 0 && (
        <div className="border-b border-border bg-surface-raised px-4 py-3 animate-slide-up">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-text-secondary">Version History</span>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowVersions(false)}>
              Close
            </Button>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {versionHistory.map((v, i) => (
              <div
                key={v.id}
                className="flex items-center justify-between px-2 py-1.5 text-xs rounded-md hover:bg-surface-overlay cursor-pointer transition-colors"
                onClick={() => i > 0 && handleRestoreVersion(v)}
              >
                <span className="text-text-secondary">
                  {new Date(v.createdAt).toLocaleString()}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-text-muted tabular-nums">{v.wordCount} words</span>
                  {i === 0 ? (
                    <span className="tag-pill text-accent">Current</span>
                  ) : (
                    <span className="tag-pill opacity-0 group-hover:opacity-100">Restore</span>
                  )}
                </div>
              </div>
            ))}
          </div>
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
    </div>
  );
}
