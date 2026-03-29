"use client";

import { useEffect, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { offlineFetch } from "@/lib/offline/sync-queue";
import { MessageSquare, AlertTriangle, RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type { StructureNode, SceneStatus, ContentVersion, Annotation, StoryObject } from "@/lib/types";
import { getEditorExtensions, commentsToBeats } from "@/components/editor/editor-config";
import { useAutoSave } from "@/components/editor/use-auto-save";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { VersionHistoryPanel } from "@/components/editor/version-history-panel";
import { AnnotationsSidebar } from "@/components/editor/annotations-sidebar";
import { ConsistencyAlertsPanel } from "@/components/editor/consistency-alerts-panel";
import { VoiceMonitorPanel } from "@/components/editor/voice-monitor-panel";
import { TimelineStrip } from "@/components/timeline/timeline-strip";
import { InlineAiActionBar } from "@/components/inline-ai-action-bar";
import { useLastScene, useWritingSession } from "@/hooks/use-writing-session";

interface TimelineSceneItem {
  id: string;
  title: string;
  status: string;
  orderIndex: number;
  chapterTitle?: string;
}

interface SceneEditorProps {
  node: StructureNode;
  projectId: string;
  projectTitle?: string;
  onNodeUpdated?: () => void;
  showFocusButton?: boolean;
  timelineScenes?: TimelineSceneItem[];
  linkedCharacters?: StoryObject[];
}

export function SceneEditor({
  node,
  projectId,
  projectTitle,
  onNodeUpdated,
  showFocusButton = true,
  timelineScenes,
  linkedCharacters = [],
}: SceneEditorProps) {
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(node.wordCount || 0);
  const [status, setStatus] = useState<SceneStatus>(node.status as SceneStatus);
  const [isOnline, setIsOnline] = useState(true);
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const [versionHistory, setVersionHistory] = useState<ContentVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [latestVersionId, setLatestVersionId] = useState<string | null>(null);
  const [externalChangeDetected, setExternalChangeDetected] = useState(false);
  const [showConsistencyAlerts, setShowConsistencyAlerts] = useState(false);
  const [consistencyAlertCount, _setConsistencyAlertCount] = useState(0);
  const [showVoiceMonitor, setShowVoiceMonitor] = useState(false);

  const { scheduleSave, saveNow, saveContent, cleanup, contentRef } = useAutoSave({
    nodeId: node.id,
    onSaveStart: () => setSaving(true),
    onSaveEnd: () => setSaving(false),
    onVersionCreated: (v) => {
      setLatestVersionId(v.id);
      setLastSaved(new Date().toLocaleTimeString());
      setExternalChangeDetected(false);
    },
    onNodeUpdated,
  });

  const { recordLastScene } = useLastScene();
  const { recordWords } = useWritingSession();

  // Record this scene as the last-edited scene when opened
  useEffect(() => {
    recordLastScene({
      projectId,
      projectTitle: projectTitle || "",
      sceneId: node.id,
      sceneTitle: node.title,
      timestamp: Date.now(),
    });
  }, [node.id, projectId]);

  // Track session words whenever word count changes
  useEffect(() => {
    if (wordCount > 0) recordWords(wordCount);
  }, [wordCount]);

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

    fetch(`/api/nodes/${node.id}/annotations`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setAnnotations(data);
      });
  }, [node.id]);

  // Health check polling
  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      try {
        const res = await fetch("/api/health");
        if (mounted) setIsOnline(res.ok);
      } catch {
        if (mounted) setIsOnline(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Polling for external changes
  useEffect(() => {
    if (!latestVersionId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/nodes/${node.id}/content`);
        const data = await res.json();
        if (data.latest && data.latest.id !== latestVersionId) {
          setExternalChangeDetected(true);
        }
      } catch {
        // ignore polling errors
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [node.id, latestVersionId]);

  // Cleanup save timeout on unmount
  useEffect(() => cleanup, [cleanup]);

  const editor = useEditor(
    {
      extensions: getEditorExtensions(),
      content: initialContent || "",
      editorProps: {
        attributes: {
          class: "prose-editor focus:outline-none min-h-full",
        },
      },
      immediatelyRender: false,
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();

        // Word count excluding beats
        let textContent = "";
        editor.state.doc.descendants((docNode) => {
          if (docNode.type.name === "beatAnnotation") return false;
          if (docNode.isText) textContent += docNode.text + " ";
          return true;
        });
        const words = textContent.trim() === "" ? 0 : textContent.trim().split(/\s+/).length;
        setWordCount(words);

        scheduleSave(html);
      },
    },
    [initialContent]
  );

  const addAnnotation = useCallback(async (text: string) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const selectedText = editor.state.doc.textBetween(from, to);

    try {
      const res = await offlineFetch(`/api/nodes/${node.id}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, range: JSON.stringify({ from, to }), selectedText }),
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
      await offlineFetch(`/api/annotations/${id}`, { method: "DELETE" });
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
      if (editor) {
        const tr = editor.state.tr;
        editor.state.doc.descendants((docNode, pos) => {
          if (!docNode.marks) return;
          docNode.marks.forEach(mark => {
            if (mark.type.name === "annotation" && mark.attrs.id === id) {
              tr.removeMark(pos, pos + docNode.nodeSize, mark.type);
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
      const res = await offlineFetch(`/api/annotations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved }),
      });
      if (res.ok) {
        setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, resolved } : a)));
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
  }, [node.id, editor, contentRef]);

  const handleStatusChange = async (newStatus: string) => {
    setStatus(newStatus as SceneStatus);
    await offlineFetch(`/api/nodes/${node.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    onNodeUpdated?.();
  };

  const loadVersionHistory = async () => {
    const res = await fetch(`/api/nodes/${node.id}/content`);
    const data = await res.json();
    setVersionHistory(data.history || []);
    setShowVersions(!showVersions);
  };

  const insertBeat = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertContent({ type: "beatAnnotation", content: [] }).run();
  }, [editor]);

  if (initialContent === null) {
    return (
      <div className="flex flex-col h-full bg-surface animate-pulse">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface-raised">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-7 w-7 bg-surface-overlay rounded" />
          ))}
          <div className="h-5 w-px bg-surface-overlay mx-1" />
          <div className="h-7 w-20 bg-surface-overlay rounded" />
        </div>
        <div className="flex-1 px-8 py-6 space-y-4">
          <div className="h-4 w-3/4 bg-surface-overlay rounded" />
          <div className="h-4 w-full bg-surface-overlay rounded" />
          <div className="h-4 w-5/6 bg-surface-overlay rounded" />
          <div className="h-4 w-2/3 bg-surface-overlay rounded" />
          <div className="h-4 w-full bg-surface-overlay rounded" />
          <div className="h-4 w-1/2 bg-surface-overlay rounded" />
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-surface-raised">
          <div className="h-3.5 w-20 bg-surface-overlay rounded" />
          <div className="h-3.5 w-28 bg-surface-overlay rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface relative">
      {/* External Change Banner */}
      {externalChangeDetected && (
        <div role="alert" className="bg-warning/20 border-b border-warning/30 px-4 py-2 flex items-center justify-between z-50 animate-slide-down">
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

      <EditorToolbar
        editor={editor}
        status={status}
        onStatusChange={handleStatusChange}
        saving={saving}
        lastSaved={lastSaved}
        onManualSave={saveNow}
        onToggleVersions={loadVersionHistory}
        showVersions={showVersions}
        onToggleAnnotations={() => setShowAnnotations(!showAnnotations)}
        showAnnotations={showAnnotations}
        annotationCount={annotations.length}
        isOnline={isOnline}
        showFocusButton={showFocusButton}
        projectId={projectId}
        nodeId={node.id}
        onInsertBeat={insertBeat}
        onToggleConsistencyAlerts={() => setShowConsistencyAlerts((v) => !v)}
        showConsistencyAlerts={showConsistencyAlerts}
        consistencyAlertCount={consistencyAlertCount}
        onToggleVoiceMonitor={() => setShowVoiceMonitor((v) => !v)}
        showVoiceMonitor={showVoiceMonitor}
      />

      <div className="flex-1 min-h-0 flex items-stretch overflow-hidden">
        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {showVersions && (
            <VersionHistoryPanel
              nodeId={node.id}
              versionHistory={versionHistory}
              onClose={() => setShowVersions(false)}
              onRestored={({ content, history }) => {
                if (editor) {
                  editor.commands.setContent(content);
                  contentRef.current = content;
                }
                setLastSaved(new Date().toLocaleTimeString());
                setVersionHistory(history);
                setShowVersions(false);
                onNodeUpdated?.();
              }}
            />
          )}

          {/* Editor */}
          <div className="flex-1 overflow-y-auto tiptap-editor relative">
            <EditorContent editor={editor} className="h-full" />
            {editor && (
              <BubbleMenu editor={editor}>
                <div className="flex flex-col gap-1">
                  {/* Inline AI Actions */}
                  <InlineAiActionBar
                    editor={editor}
                    sceneContext={contentRef.current?.replace(/<[^>]+>/g, " ").trim().slice(0, 800)}
                  />
                  {/* Comment button */}
                  <div className="flex px-1">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs gap-1 text-text-muted hover:text-text-secondary bg-surface-raised border border-border shadow-sm"
                          onClick={(e) => {
                            const { from, to } = editor.state.selection;
                            if (from === to) e.preventDefault();
                          }}
                        >
                          <MessageSquare className="h-3 w-3" /> Comment
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
                              const el = document.getElementById("new-annotation-input") as HTMLTextAreaElement;
                              if (el && el.value.trim()) addAnnotation(el.value);
                            }}>Save</Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </BubbleMenu>
            )}
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-surface-raised text-xs text-text-muted shrink-0" role="status" aria-live="polite">
            <span className="tabular-nums">{wordCount.toLocaleString()} words</span>
            {lastSaved && (
              <span className="flex items-center gap-1">
                <Check className="h-3 w-3 text-success" aria-hidden="true" />
                Last saved {lastSaved}
              </span>
            )}
          </div>
        </div>

        {/* Annotations Sidebar */}
        {showAnnotations && (
          <AnnotationsSidebar
            annotations={annotations}
            onClose={() => setShowAnnotations(false)}
            onResolve={resolveAnnotation}
            onDelete={deleteAnnotation}
          />
        )}

        {/* Consistency Alerts Panel */}
        {showConsistencyAlerts && (
          <div className="w-72 shrink-0 border-l border-border overflow-y-auto">
            <ConsistencyAlertsPanel
              projectId={projectId}
              sceneId={node.id}
              onClose={() => setShowConsistencyAlerts(false)}
            />
          </div>
        )}

        {/* Voice Monitor Panel */}
        {showVoiceMonitor && (
          <div className="w-72 shrink-0 border-l border-border overflow-y-auto">
            <VoiceMonitorPanel
              projectId={projectId}
              sceneId={node.id}
              linkedCharacters={linkedCharacters}
              onClose={() => setShowVoiceMonitor(false)}
            />
          </div>
        )}
      </div>

      {/* Timeline Strip */}
      {timelineScenes && timelineScenes.length > 0 && (
        <TimelineStrip
          scenes={timelineScenes}
          currentSceneId={node.id}
          projectId={projectId}
        />
      )}
    </div>
  );
}
