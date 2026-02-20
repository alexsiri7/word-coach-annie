"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
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
  MessageSquare,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Bookmark,
  Maximize,
  Wifi,
  WifiOff,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { StructureNode, SceneStatus, ContentVersion, Annotation } from "@/lib/types";
import { BeatAnnotation } from "@/components/editor/extensions/beat";

// Helper to convert HTML comments to beat nodes for Tiptap
export const commentsToBeats = (html: string) => {
  return html.replace(/<!-- beat: ([\s\S]*?) -->/g, (match, content) => {
    return `<div data-type="beat-annotation">${content}</div>`;
  });
};

// Helper to convert beat nodes back to HTML comments for storage
export const beatsToComments = (html: string) => {
  if (typeof window === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const beats = doc.querySelectorAll('div[data-type="beat-annotation"]');

  beats.forEach((beat) => {
    const content = beat.innerHTML;
    // Create comment with the content
    // We use the exact format expected by the regex: " beat: " + content + " "
    // Actually the regex is /<!-- beat: (.*?) -->/g
    // So we just need to ensure it matches.
    // The previous implementation used space padding sometimes?
    // Let's construct the string manually to be safe and replace the outerHTML
    // replacing with comment node might be cleaner but we need the string representation eventually.
    // But beat.replaceWith(commentNode) works in the DOM.
    const comment = doc.createComment(` beat: ${content} `);
    beat.replaceWith(comment);
  });

  return doc.body.innerHTML;
};

// Custom Highlight extension to support IDs
const AnnotationMark = Highlight.extend({
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-annotation-id'),
        renderHTML: (attributes) => {
          if (!attributes.id) {
            return {};
          }
          return {
            'data-annotation-id': attributes.id,
            'class': 'bg-yellow-200 dark:bg-yellow-900/50 border-b-2 border-yellow-500 cursor-pointer',
          };
        },
      },
    };
  },
});

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
  onNodeUpdated?: () => void;
  showFocusButton?: boolean;
}

export function SceneEditor({ node, projectId, onNodeUpdated, showFocusButton = true }: SceneEditorProps) {
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(node.wordCount || 0);
  const [status, setStatus] = useState<SceneStatus>(node.status as SceneStatus);
  const [isOnline, setIsOnline] = useState(true);
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
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [latestVersionId, setLatestVersionId] = useState<string | null>(null);
  const [externalChangeDetected, setExternalChangeDetected] = useState(false);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const contentRef = useRef<string>("");

  // Load initial content
  useEffect(() => {
    fetch(`/api/nodes/${node.id}/content`)
      .then((res) => res.json())
      .then((data) => {
        setInitialContent(commentsToBeats(data.latest?.content || ""));
        setVersionHistory(data.history || []);
        if (data.latest) {
          setWordCount(data.latest.wordCount);
          setLatestVersionId(data.latest.id);
        }
      });

    // Load annotations
    fetch(`/api/nodes/${node.id}/annotations`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAnnotations(data);
        }
      });
  }, [node.id]);

  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (mounted) setIsOnline(res.ok);
      } catch (err) {
        if (mounted) setIsOnline(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 15000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Polling for external changes
  useEffect(() => {
    if (!latestVersionId) return;

    const interval = setInterval(async () => {
      try {
        // Just fetch metadata to check latest version
        const res = await fetch(`/api/nodes/${node.id}/content`);
        const data = await res.json();

        if (data.latest && data.latest.id !== latestVersionId) {
          setExternalChangeDetected(true);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [node.id, latestVersionId]);

  const saveContent = useCallback(
    async (content: string) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/nodes/${node.id}/content`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: beatsToComments(content) }),
        });

        if (res.ok) {
          const newVersion = await res.json();
          setLatestVersionId(newVersion.id);
          setLastSaved(new Date().toLocaleTimeString());
          setExternalChangeDetected(false);
          onNodeUpdated?.();
        }
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
        AnnotationMark.configure({
          HTMLAttributes: {
            class: "bg-yellow-200 dark:bg-yellow-900/50 border-b-2 border-yellow-500 cursor-pointer",
          },
        }),
        Placeholder.configure({
          placeholder: "Start writing your scene...",
        }),
        BeatAnnotation,
      ],
      content: initialContent || "",
      editorProps: {
        attributes: {
          class: "prose-editor focus:outline-none min-h-full",
        },
      },
      immediatelyRender: false,
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        contentRef.current = html;

        // Custom word count excluding beats
        let textContent = "";
        editor.state.doc.descendants((node) => {
          if (node.type.name === "beatAnnotation") {
            return false; // Skip traversing children of beats (though they are inline currently)
          }
          if (node.isText) {
            textContent += node.text + " ";
          }
          return true;
        });

        const words = textContent.trim() === "" ? 0 : textContent.trim().split(/\s+/).length;
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

  const addAnnotation = useCallback(async (text: string) => {
    if (!editor) return;

    // Get selection range
    const { from, to } = editor.state.selection;
    if (from === to) return; // No selection

    const selectedText = editor.state.doc.textBetween(from, to);

    try {
      const res = await fetch(`/api/nodes/${node.id}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          range: JSON.stringify({ from, to }),
          selectedText,
        }),
      });

      if (res.ok) {
        const newAnnotation = await res.json();
        setAnnotations((prev) => [newAnnotation, ...prev]);
        setShowAnnotations(true);
        editor.chain().focus().setTextSelection({ from, to }).setMark("annotation", { id: newAnnotation.id }).run();
        saveContent(editor.getHTML());
      }
    } catch (e) {
      console.error("Failed to add annotation", e);
    }
  }, [editor, node.id, saveContent]);

  const deleteAnnotation = useCallback(async (id: string) => {
    try {
      await fetch(`/api/annotations/${id}`, { method: "DELETE" });
      setAnnotations((prev) => prev.filter((a) => a.id !== id));

      if (editor) {
        const tr = editor.state.tr;
        editor.state.doc.descendants((node, pos) => {
          if (!node.marks) return;
          node.marks.forEach(mark => {
            if (mark.type.name === 'annotation' && mark.attrs.id === id) {
              tr.removeMark(pos, pos + node.nodeSize, mark.type);
            }
          });
        });
        editor.view.dispatch(tr);
        saveContent(editor.getHTML());
      }
    } catch (e) {
      console.error("Failed to delete annotation", e);
    }
  }, [editor, saveContent]);

  const resolveAnnotation = useCallback(async (id: string, resolved: boolean) => {
    try {
      const res = await fetch(`/api/annotations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved }),
      });

      if (res.ok) {
        setAnnotations((prev) =>
          prev.map((a) => (a.id === id ? { ...a, resolved } : a))
        );
      }
    } catch (e) {
      console.error("Failed to update annotation status", e);
    }
  }, []);

  const handleExternalChange = useCallback(async () => {
    const res = await fetch(`/api/nodes/${node.id}/content`);
    const data = await res.json();
    if (data.latest) {
      const converted = commentsToBeats(data.latest.content);
      setInitialContent(converted);
      if (editor) {
        editor.commands.setContent(converted);
        contentRef.current = converted;
      }
      setLatestVersionId(data.latest.id);
      setExternalChangeDetected(false);
      setLastSaved(new Date().toLocaleTimeString());
    }
  }, [node.id, editor]);

  // Manual save
  const handleManualSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (contentRef.current) {
      saveContent(contentRef.current);
    }
  }, [saveContent]);

  const insertBeat = useCallback(() => {
    if (!editor) return;

    editor.chain().focus().insertContent({
      type: "beatAnnotation",
      content: [], // Empty content
    }).run();

    // Attempt to focus the last inserted node? 
    // insertContent moves selection to end of inserted content.
    // Since it's empty, it should be inside the beat?
    // Let's verify. If fails, we might need to select it explicitly.
  }, [editor]);
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
    onNodeUpdated?.();
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
        onNodeUpdated?.();

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
    <div className="flex flex-col h-full bg-surface relative">
      {/* External Change Banner */}
      {externalChangeDetected && (
        <div className="bg-warning/20 border-b border-warning/30 px-4 py-2 flex items-center justify-between z-50 animate-slide-down">
          <span className="text-sm text-warning flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            External changes detected
          </span>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 hover:bg-warning/20 text-warning" onClick={handleExternalChange}>
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-surface-raised shrink-0">
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

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={insertBeat}
          title="Insert Beat"
        >
          <Bookmark className="h-4 w-4" />
        </Button>

        <div className="w-px h-5 bg-border mx-1" />

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor?.chain().focus().undo().run()}>
          <Undo className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor?.chain().focus().redo().run()}>
          <Redo className="h-4 w-4" />
        </Button>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", showAnnotations && "bg-accent/15 text-accent")}
            onClick={() => setShowAnnotations(!showAnnotations)}
            title={showAnnotations ? "Hide annotations" : "Show annotations"}
          >
            <div className="relative">
              <MessageSquare className="h-4 w-4" />
              {annotations.length > 0 && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent animate-pulse" />
              )}
            </div>
          </Button>

          {showFocusButton && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => window.location.href = `/project/${projectId}/scene/${node.id}/focus`}
              title="Focus Mode"
            >
              <Maximize className="h-4 w-4" />
            </Button>
          )}

          <div
            className="flex items-center gap-1.5 ml-2 px-2 py-1 rounded-md text-xs cursor-help transition-colors"
            title={isOnline ? "Backend connected" : "Backend disconnected - edits may not save"}
          >
            {isOnline ? (
              <>
                <Wifi className="h-3 w-3 text-success" />
                <span className="text-text-muted hidden sm:inline-block">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 text-danger animate-pulse" />
                <span className="text-danger hidden sm:inline-block">Disconnected</span>
              </>
            )}
          </div>

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
      </div>

      <div className="flex-1 min-h-0 flex items-stretch overflow-hidden">
        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Version history panel */}
          {showVersions && (
            <div className="border-b border-border bg-surface-raised animate-slide-up shrink-0">
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
          <div className="flex-1 overflow-y-auto tiptap-editor relative">
            <EditorContent editor={editor} className="h-full" />
            {editor && (
              <BubbleMenu editor={editor}>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shadow-lg gap-1.5 h-8 px-2 bg-surface-raised border border-border text-xs"
                      onClick={(e) => {
                        // Prevent default if necessary, but PopoverTrigger handles it
                        const { from, to } = editor.state.selection;
                        if (from === to) e.preventDefault();
                      }}
                    >
                      <MessageSquare className="h-3.5 w-3.5" /> Comment
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3" align="start" sideOffset={5}>
                    <div className="flex flex-col gap-2">
                      <h4 className="font-medium text-xs text-text-secondary">Add Annotation</h4>
                      <Textarea
                        placeholder="Type your comment..."
                        className="text-sm min-h-[80px] w-full"
                        id="new-annotation-input"
                        autoFocus
                      />
                      <div className="flex justify-end">
                        <Button size="sm" onClick={() => {
                          const el = document.getElementById('new-annotation-input') as HTMLTextAreaElement;
                          if (el && el.value.trim()) {
                            addAnnotation(el.value);
                            // The mark will be persistent
                          }
                        }}>Save</Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </BubbleMenu>
            )}
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-surface-raised text-xs text-text-muted shrink-0">
            <span className="tabular-nums">{wordCount.toLocaleString()} words</span>
            {lastSaved && (
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3 text-success" />
                Last saved {lastSaved}
              </span>
            )}
          </div>
        </div>

        {/* Annotations Sidebar */}
        {showAnnotations && (
          <div className="w-80 border-l border-border bg-surface-raised flex flex-col animate-slide-in-right shrink-0">
            <div className="p-3 border-b border-border font-medium text-sm flex items-center justify-between bg-surface">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-accent" />
                <span>Annotations ({annotations.length})</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowAnnotations(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {annotations.length === 0 ? (
                <div className="text-text-muted text-xs text-center py-4 flex flex-col items-center gap-2">
                  <MessageSquare className="h-8 w-8 opacity-20" />
                  <p>No annotations yet</p>
                  <p className="opacity-70">Select text to add a comment</p>
                </div>
              ) : (
                annotations.map(a => (
                  <div
                    key={a.id}
                    className={cn(
                      "bg-surface border rounded-lg p-3 text-sm shadow-sm group transition-all",
                      a.resolved
                        ? "border-border-subtle opacity-60 hover:opacity-100"
                        : "border-border hover:border-accent/40"
                    )}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-5 w-5 mt-0.5 shrink-0 rounded-full border",
                          a.resolved
                            ? "bg-accent text-white border-accent hover:bg-accent-hover hover:border-accent-hover"
                            : "bg-transparent border-input hover:bg-accent/10 hover:border-accent text-transparent hover:text-accent/50"
                        )}
                        onClick={() => resolveAnnotation(a.id, !a.resolved)}
                        title={a.resolved ? "Mark as unresolved" : "Mark as resolved"}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <div className={cn("text-text-secondary whitespace-pre-wrap leading-relaxed flex-1", a.resolved && "line-through text-text-muted")}>
                        {a.content}
                      </div>
                    </div>

                    {a.selectedText && (
                      <div className="mb-2 pl-7">
                        <div className="bg-surface-sunken p-1.5 rounded text-xs text-text-muted italic truncate border border-border-subtle">
                          "{a.selectedText}"
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-text-muted pl-7">
                      <span>{timeAgo(a.createdAt)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 -mr-1 text-text-muted hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => deleteAnnotation(a.id)}
                        title="Delete annotation"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
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
