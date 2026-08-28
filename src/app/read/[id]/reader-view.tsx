"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  List,
  X as XIcon,
  BookOpen,
  Clock,
  ArrowLeft,
  Flag,
  Download,
  MessageSquare,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { ReportContentDialog } from "@/components/report-content-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Annotation, TextQuoteRange } from "@/lib/types";

interface OutlineNode {
  id: string;
  type: string;
  title: string;
  orderIndex: number;
  parentId: string | null;
  children: OutlineNode[];
  content?: string;
}

interface Project {
  id: string;
  title: string;
  author: string;
  genre: string;
  synopsis: string;
}

interface ReaderViewProps {
  project: Project;
  outline: OutlineNode[];
  isOwner: boolean;
}

/** Strip beat annotations from HTML content */
function stripBeats(html: string): string {
  return html.replace(/<!-- beat:[\s\S]*?-->/g, "");
}

/** Count total words across all scenes */
function countWords(outline: OutlineNode[]): number {
  let count = 0;
  for (const node of outline) {
    if (node.type === "SCENE" && node.content) {
      const text = stripBeats(node.content).replace(/<[^>]+>/g, "");
      count += text.split(/\s+/).filter(Boolean).length;
    }
    count += countWords(node.children);
  }
  return count;
}

/** Estimate reading time in minutes (~250 wpm) */
function estimateReadingTime(words: number): number {
  return Math.max(1, Math.round(words / 250));
}

/** Collect chapters for TOC */
interface TocEntry {
  id: string;
  title: string;
  type: string;
  depth: number;
}

function collectTocEntries(nodes: OutlineNode[], depth: number = 0): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const node of nodes) {
    if (node.type === "PART" || node.type === "CHAPTER") {
      entries.push({ id: node.id, title: node.title, type: node.type, depth });
      entries.push(...collectTocEntries(node.children, depth + 1));
    }
  }
  return entries;
}

function collectSceneNodes(nodes: OutlineNode[]): OutlineNode[] {
  const scenes: OutlineNode[] = [];
  for (const node of nodes) {
    if (node.type === "SCENE" && node.content && node.content !== "<p></p>") {
      scenes.push(node);
    }
    scenes.push(...collectSceneNodes(node.children));
  }
  return scenes;
}

const PREFIX_SUFFIX_LEN = 32;

function parseAnnotationRange(range: string | null | undefined): { type: string; prefix?: string } | null {
  if (!range) return null;
  try {
    return JSON.parse(range);
  } catch {
    return null;
  }
}

function getTextOffset(container: HTMLElement, targetNode: Node, targetOffset: number): number {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;
  let textNode: Text | null;
  while ((textNode = walker.nextNode() as Text | null)) {
    if (textNode === targetNode) return total + targetOffset;
    total += textNode.textContent?.length ?? 0;
  }
  return total;
}

function applyHighlight(container: HTMLElement, searchText: string, annotationId: string, prefix = ""): void {
  if (!searchText) return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number }[] = [];
  let fullText = "";
  let textNode: Text | null;

  while ((textNode = walker.nextNode() as Text | null)) {
    if (textNode.parentElement?.tagName === "MARK") continue;
    nodes.push({ node: textNode, start: fullText.length });
    fullText += textNode.textContent ?? "";
  }

  let idx = -1;
  if (prefix) {
    const contextIdx = fullText.indexOf(prefix + searchText);
    if (contextIdx !== -1) idx = contextIdx + prefix.length;
  }
  if (idx === -1) idx = fullText.indexOf(searchText);
  if (idx === -1) return;

  const endIdx = idx + searchText.length;
  let startNode: Text | undefined;
  let startOffset = 0;
  let endNode: Text | undefined;
  let endOffset = 0;

  for (const { node, start } of nodes) {
    const nodeEnd = start + (node.textContent?.length ?? 0);
    if (!startNode && nodeEnd > idx) {
      startNode = node;
      startOffset = idx - start;
    }
    if (!endNode && nodeEnd >= endIdx) {
      endNode = node;
      endOffset = endIdx - start;
      break;
    }
  }

  if (!startNode || !endNode) return;

  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    const mark = document.createElement("mark");
    mark.dataset.annotationId = annotationId;
    mark.className = "bg-yellow-200 dark:bg-yellow-900/50 border-b-2 border-yellow-500 cursor-pointer";

    range.surroundContents(mark);
  } catch {
    // Cannot wrap this selection — skip silently
  }
}

function removeHighlights(container: HTMLElement): void {
  for (const mark of container.querySelectorAll("mark[data-annotation-id]")) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }
}

function AnnotationTooltip({
  annotation,
  position,
  onClose,
}: {
  annotation: Annotation;
  position: { x: number; y: number };
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-72 bg-surface-raised border border-border rounded-lg shadow-xl p-3 text-sm"
        style={{
          left: Math.min(position.x, window.innerWidth - 300),
          top: position.y + 8,
        }}
      >
        <div className="text-text-secondary whitespace-pre-wrap leading-relaxed">
          {annotation.content}
        </div>
        {annotation.selectedText && (
          <div className="mt-2 bg-surface-sunken p-1.5 rounded text-xs text-text-muted italic border border-border-subtle">
            &quot;{annotation.selectedText}&quot;
          </div>
        )}
      </div>
    </>
  );
}

interface SelectionState {
  position: { x: number; y: number };
  sceneId: string;
  selectedText: string;
  prefix: string;
  suffix: string;
  mode: "buttons" | "comment" | "task";
}

function SelectionPopover({
  projectId,
  isOwner,
  onAnnotationCreated,
}: {
  projectId: string;
  isOwner: boolean;
  onAnnotationCreated: (sceneId: string, annotation: Annotation) => void;
}) {
  const [sel, setSel] = useState<SelectionState | null>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const taskRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSel(null);
        return;
      }
      const anchorEl =
        selection.anchorNode?.nodeType === Node.TEXT_NODE
          ? selection.anchorNode.parentElement
          : (selection.anchorNode as HTMLElement | null);
      const proseEl = anchorEl?.closest<HTMLElement>(".reader-prose");
      if (!proseEl) {
        setSel(null);
        return;
      }
      const sceneId = proseEl.dataset.nodeId;
      if (!sceneId) return;
      const selectedText = selection.toString().trim();
      if (!selectedText) return;
      const domRange = selection.getRangeAt(0);
      const rect = domRange.getBoundingClientRect();
      const startOff = getTextOffset(proseEl, domRange.startContainer, domRange.startOffset);
      const fullText = proseEl.textContent ?? "";
      const prefix = fullText.slice(Math.max(0, startOff - PREFIX_SUFFIX_LEN), startOff);
      const suffix = fullText.slice(startOff + selectedText.length, startOff + selectedText.length + PREFIX_SUFFIX_LEN);
      setSel({
        position: {
          x: rect.left + rect.width / 2,
          y: rect.bottom,
        },
        sceneId,
        selectedText,
        prefix,
        suffix,
        mode: "buttons",
      });
    };
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, []);

  useEffect(() => {
    if (!sel) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSel(null);
    };
    const handleSelectionChange = () => {
      if (sel.mode !== "buttons") return;
      const s = window.getSelection();
      if (!s || s.isCollapsed) setSel(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [sel]);

  const handleCommentSave = async () => {
    const text = commentRef.current?.value.trim();
    if (!text || !sel) return;
    try {
      const res = await fetch(`/api/nodes/${sel.sceneId}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          range: JSON.stringify({
            type: "textQuote",
            selectedText: sel.selectedText,
            prefix: sel.prefix,
            suffix: sel.suffix,
          } satisfies TextQuoteRange),
          selectedText: sel.selectedText,
        }),
      });
      if (res.ok) {
        const annotation: Annotation = await res.json();
        onAnnotationCreated(sel.sceneId, annotation);
        setSel(null);
      }
    } catch (e) {
      console.error("Failed to add annotation", e);
    }
  };

  const handleTaskSave = async () => {
    const name = taskRef.current?.value.trim();
    if (!name || !sel) return;
    try {
      const res = await fetch("/api/writing-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          sceneId: sel.sceneId,
          name,
          whatIsNeeded: sel.selectedText,
        }),
      });
      if (res.ok) setSel(null);
    } catch (e) {
      console.error("Failed to create writing task", e);
    }
  };

  if (!sel) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setSel(null)} />
      <div
        className="fixed z-50 bg-surface-raised border border-border rounded-lg shadow-xl p-2 text-sm"
        style={{
          left: Math.min(sel.position.x - 60, window.innerWidth - 240),
          top: sel.position.y + 8,
        }}
      >
        {sel.mode === "buttons" && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => setSel((s) => s && { ...s, mode: "comment" })}
            >
              <MessageSquare className="h-3 w-3" /> Comment
            </Button>
            {isOwner && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => setSel((s) => s && { ...s, mode: "task" })}
              >
                <Plus className="h-3 w-3" /> Add task
              </Button>
            )}
          </div>
        )}
        {sel.mode === "comment" && (
          <div className="flex flex-col gap-2 w-64">
            <h4 className="font-medium text-xs text-text-secondary">Add Comment</h4>
            <Textarea
              ref={commentRef}
              placeholder="Type your comment..."
              className="text-sm min-h-[80px] w-full"
              autoFocus
            />
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" onClick={() => setSel(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCommentSave}>
                Save
              </Button>
            </div>
          </div>
        )}
        {sel.mode === "task" && (
          <div className="flex flex-col gap-2 w-64">
            <h4 className="font-medium text-xs text-text-secondary">Add Task</h4>
            <Input
              ref={taskRef}
              placeholder="Task name..."
              className="text-sm"
              autoFocus
            />
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" onClick={() => setSel(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleTaskSave}>
                Save
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function SceneContent({
  content,
  nodeId,
  annotations,
  onAnnotationClick,
}: {
  content: string;
  nodeId?: string;
  annotations?: Annotation[];
  onAnnotationClick?: (annotation: Annotation, pos: { x: number; y: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleaned = stripBeats(content);
  if (!cleaned || cleaned === "<p></p>") return null;

  // Sanitize HTML to prevent XSS — content may come from another user via sharing.
  // isomorphic-dompurify works on both SSR and client, so no window guard needed.
  // ADD_TAGS: ["mark"] allows the <mark> elements we inject post-sanitize.
  const sanitized = useMemo(() => {
    const DOMPurify = require("isomorphic-dompurify");
    return DOMPurify.sanitize(cleaned, { ADD_TAGS: ["mark"] });
  }, [cleaned]);

  // Apply DOM highlights after render
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    removeHighlights(container);
    if (!annotations || annotations.length === 0) return;
    const unresolved = annotations.filter((a) => !a.resolved && a.selectedText);
    for (const annotation of unresolved) {
      const parsedRange = parseAnnotationRange(annotation.range);
      const prefix = parsedRange?.type === "textQuote" ? (parsedRange.prefix ?? "") : "";
      applyHighlight(container, annotation.selectedText!, annotation.id, prefix);
    }
  }, [annotations, sanitized]);

  // Click handler delegated to container
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onAnnotationClick) return;
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("mark[data-annotation-id]") as HTMLElement | null;
      if (!target) return;
      const id = target.dataset.annotationId;
      const annotation = annotations?.find((a) => a.id === id);
      if (!annotation) return;
      const rect = target.getBoundingClientRect();
      onAnnotationClick(annotation, { x: rect.left, y: rect.bottom });
    };
    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [annotations, onAnnotationClick]);

  return (
    // NOTE: class name "reader-prose" is referenced in sentry.client.config.ts
    // for session replay masking (PII). Update sentry config if this class is renamed.
    <div
      ref={containerRef}
      className="reader-prose"
      data-node-id={nodeId}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

function ManuscriptNode({
  node,
  chapterCounter,
  isFirst,
  annotationsByScene,
  onAnnotationClick,
}: {
  node: OutlineNode;
  chapterCounter: { value: number };
  isFirst?: boolean;
  annotationsByScene: Map<string, Annotation[]>;
  onAnnotationClick: (annotation: Annotation, pos: { x: number; y: number }) => void;
}) {
  if (node.type === "PART") {
    return (
      <section id={node.id} className="mt-24 mb-12 first:mt-8">
        <h2 className="font-editorial text-3xl sm:text-4xl font-bold text-text-primary text-center tracking-tight mb-2">
          {node.title}
        </h2>
        <div className="flex justify-center items-center gap-3 my-8">
          <div className="h-px w-8 bg-border/40" />
          <BookOpen className="h-3.5 w-3.5 text-text-muted/40" />
          <div className="h-px w-8 bg-border/40" />
        </div>
        {node.children.map((child, i) => (
          <ManuscriptNode
            key={child.id}
            node={child}
            chapterCounter={chapterCounter}
            isFirst={i === 0 && isFirst}
            annotationsByScene={annotationsByScene}
            onAnnotationClick={onAnnotationClick}
          />
        ))}
      </section>
    );
  }

  if (node.type === "CHAPTER") {
    chapterCounter.value++;
    const scenes = node.children.filter((c) => c.type === "SCENE");
    const hasAnyContent = scenes.some(
      (s) => s.content && s.content !== "<p></p>"
    );

    return (
      <section id={node.id} className="mt-20 mb-12">
        {/* Chapter start typography */}
        <div className="text-center mb-16">
          <span className="label-md text-text-muted tracking-[0.3em] block mb-4">
            Chapter {chapterCounter.value}
          </span>
          <h3 className="display-lg italic font-extralight tracking-tight text-text-primary leading-tight">
            {node.title}
          </h3>
          <div className="flex justify-center items-center gap-3 mt-10">
            <div className="h-px w-8 bg-border/40" />
            <BookOpen className="h-3.5 w-3.5 text-text-muted/40" />
            <div className="h-px w-8 bg-border/40" />
          </div>
        </div>
        {hasAnyContent ? (
          scenes.map((scene, i) => (
            <div key={scene.id}>
              {i > 0 && scene.content && scene.content !== "<p></p>" && (
                <hr className="my-10 border-0 h-px bg-border/30" />
              )}
              <SceneContent
                nodeId={scene.id}
                content={scene.content || ""}
                annotations={annotationsByScene.get(scene.id)}
                onAnnotationClick={onAnnotationClick}
              />
            </div>
          ))
        ) : (
          <p className="text-center text-text-muted italic text-sm py-4">
            No content yet.
          </p>
        )}
      </section>
    );
  }

  // Standalone scene (not inside a chapter)
  if (node.type === "SCENE" && node.content && node.content !== "<p></p>") {
    return (
      <section id={node.id} className="my-8">
        <SceneContent
          nodeId={node.id}
          content={node.content}
          annotations={annotationsByScene.get(node.id)}
          onAnnotationClick={onAnnotationClick}
        />
      </section>
    );
  }

  return null;
}

export function ReaderView({ project, outline, isOwner }: ReaderViewProps) {
  const [tocOpen, setTocOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [annotationsByScene, setAnnotationsByScene] = useState<Map<string, Annotation[]>>(new Map());
  const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const tocEntries = collectTocEntries(outline);
  const wordCount = countWords(outline);
  const readingTime = estimateReadingTime(wordCount);
  const chapterCounter = { value: 0 };

  useEffect(() => {
    const scenes = collectSceneNodes(outline);
    if (scenes.length === 0) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        scenes.map(async (scene) => {
          try {
            const res = await fetch(`/api/nodes/${scene.id}/annotations`);
            if (!res.ok) return { sceneId: scene.id, annotations: [] as Annotation[] };
            const data: Annotation[] = await res.json();
            return { sceneId: scene.id, annotations: data };
          } catch {
            return { sceneId: scene.id, annotations: [] as Annotation[] };
          }
        })
      );
      if (cancelled) return;
      setAnnotationsByScene(new Map(results.map(({ sceneId, annotations }) => [sceneId, annotations])));
    })();
    return () => { cancelled = true; };
  }, [outline]);

  const handleTooltipClose = useCallback(() => {
    setActiveAnnotation(null);
    setTooltipPos(null);
  }, []);

  const handleAnnotationClick = useCallback((annotation: Annotation, pos: { x: number; y: number }) => {
    setActiveAnnotation(annotation);
    setTooltipPos(pos);
  }, []);

  const handleAnnotationCreated = useCallback((sceneId: string, annotation: Annotation) => {
    setAnnotationsByScene(prev => {
      const next = new Map(prev);
      const existing = next.get(sceneId) ?? [];
      next.set(sceneId, [annotation, ...existing]);
      return next;
    });
  }, []);

  const handleTocClick = (id: string) => {
    setTocOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  async function downloadAs(format: "pdf" | "epub" | "docx") {
    const res = await fetch(`/api/projects/${project.id}/export/${format}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Translucent top bar */}
      <header className="fixed top-0 left-0 w-full z-40 bg-surface/40 backdrop-blur-sm transition-all duration-300">
        <div className="flex justify-between items-center w-full px-6 md:px-8 py-4 max-w-full mx-auto">
          <div className="flex items-center gap-4">
            <button
              onClick={() => window.history.back()}
              className="p-2 text-text-primary hover:bg-surface-overlay rounded-full transition-colors duration-150 active:scale-95"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="hidden md:block">
              <h1 className="text-lg font-editorial italic font-bold text-text-primary leading-none tracking-tight">Annie</h1>
              <p className="label-md text-[10px] text-text-muted opacity-60">Reader Mode</p>
            </div>
          </div>
          <div className="flex items-center gap-4 md:gap-6">
            {wordCount > 0 && (
              <div className="flex items-center gap-2 label-md text-[10px] font-bold tracking-wider text-text-muted">
                <Clock className="h-3.5 w-3.5" />
                <span>{readingTime}m read</span>
              </div>
            )}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-9 w-9 rounded-full flex items-center justify-center transition-colors hover:bg-surface-overlay text-text-secondary hover:text-text-primary"
                  aria-label="Download manuscript"
                >
                  <Download className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => downloadAs("pdf")}>
                  Download PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadAs("epub")}>
                  Download EPUB
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadAs("docx")}>
                  Download DOCX
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {tocEntries.length > 0 && (
              <button
                onClick={() => setTocOpen(!tocOpen)}
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center transition-colors",
                  "hover:bg-surface-overlay text-text-secondary hover:text-text-primary"
                )}
                aria-label="Table of contents"
              >
                {tocOpen ? (
                  <XIcon className="h-4 w-4" />
                ) : (
                  <List className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Table of contents drawer */}
      {tocOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setTocOpen(false)}
          />
          <nav className="fixed top-0 right-0 z-50 h-full w-80 max-w-[85vw] bg-surface-raised border-l border-border/15 shadow-2xl overflow-y-auto animate-slide-in-right">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="label-md text-text-muted">
                  Contents
                </h2>
                <button
                  onClick={() => setTocOpen(false)}
                  className="h-8 w-8 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors"
                  aria-label="Close table of contents"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
              <ul className="space-y-1">
                {tocEntries.map((entry) => (
                  <li key={entry.id}>
                    <button
                      onClick={() => handleTocClick(entry.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                        "hover:bg-surface-overlay text-text-secondary hover:text-text-primary",
                        entry.type === "PART" && "font-semibold text-text-primary",
                        entry.depth > 0 && "pl-6"
                      )}
                    >
                      {entry.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </>
      )}

      {/* Main manuscript canvas */}
      <main className="relative pt-32 pb-64 px-6 md:px-0 max-w-2xl mx-auto">
        {/* Title page */}
        <section className="mb-24 text-center">
          <span className="label-md text-[10px] tracking-[0.3em] text-text-muted block mb-4">
            {project.author ? `by ${project.author}` : "A Manuscript"}
          </span>
          <h2 className="font-editorial text-5xl md:text-6xl italic font-extralight tracking-tight text-text-primary leading-tight">
            {project.title}
          </h2>
          <div className="mt-12 flex justify-center items-center gap-3">
            <div className="h-px w-8 bg-border/40" />
            <BookOpen className="h-3.5 w-3.5 text-text-muted/40" />
            <div className="h-px w-8 bg-border/40" />
          </div>
        </section>

        {/* Manuscript body */}
        <article className="space-y-10">
          {outline.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-text-muted italic font-editorial text-lg">
                This manuscript has no content yet.
              </p>
            </div>
          ) : (
            outline.map((node, i) => (
              <ManuscriptNode
                key={node.id}
                node={node}
                chapterCounter={chapterCounter}
                isFirst={i === 0}
                annotationsByScene={annotationsByScene}
                onAnnotationClick={handleAnnotationClick}
              />
            ))
          )}
        </article>

        {/* Stamp chip footer */}
        {outline.length > 0 && (
          <footer className="mt-32 pt-16 border-t border-border/10 flex flex-wrap gap-4 justify-center">
            {wordCount > 0 && (
              <span className="stamp-chip gap-2">
                <BookOpen className="h-3 w-3" />
                <span>{wordCount.toLocaleString()} Words</span>
              </span>
            )}
            {project.genre && (
              <span className="stamp-chip gap-2">
                {project.genre}
              </span>
            )}
            <span className="stamp-chip gap-2 text-accent">
              <Clock className="h-3 w-3" />
              <span>{readingTime} min read</span>
            </span>
          </footer>
        )}
      </main>

      {/* Bottom navigation bar */}
      <nav className="fixed bottom-0 left-0 w-full flex justify-between items-center px-8 md:px-12 py-3 bg-surface/80 backdrop-blur-md border-t border-border/5 z-40">
        <div className="flex items-center gap-6 md:gap-8">
          {tocEntries.length > 0 && (
            <button
              onClick={() => setTocOpen(!tocOpen)}
              className="flex flex-col items-center gap-1 group"
            >
              <List className="h-4 w-4 text-text-muted group-hover:text-text-primary transition-colors" />
              <span className="label-md text-[10px] font-bold tracking-wider text-text-muted">Outline</span>
            </button>
          )}
        </div>
        {/* Progress bar (desktop) */}
        <div className="hidden md:flex items-center gap-4">
          {wordCount > 0 && (
            <>
              <div className="w-48 h-1 bg-surface-overlay rounded-full overflow-hidden">
                <div className="w-full h-full bg-accent rounded-full" />
              </div>
              <span className="label-md text-[10px] font-bold text-text-muted">
                {wordCount.toLocaleString()} words
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-6 md:gap-8">
          <button
            onClick={() => setReportOpen(true)}
            className="flex flex-col items-center gap-1 group"
          >
            <Flag className="h-4 w-4 text-text-muted group-hover:text-text-primary transition-colors" />
            <span className="label-md text-[10px] font-bold tracking-wider text-text-muted">Report</span>
          </button>
          <button
            onClick={() => window.history.back()}
            className="flex flex-col items-center gap-1 group"
          >
            <ArrowLeft className="h-4 w-4 text-text-muted group-hover:text-text-primary transition-colors" />
            <span className="label-md text-[10px] font-bold tracking-wider text-text-muted">Back</span>
          </button>
        </div>
      </nav>

      <ReportContentDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        projectId={project.id}
        projectTitle={project.title}
      />

      {activeAnnotation && tooltipPos && (
        <AnnotationTooltip
          annotation={activeAnnotation}
          position={tooltipPos}
          onClose={handleTooltipClose}
        />
      )}

      <SelectionPopover
        projectId={project.id}
        isOwner={isOwner}
        onAnnotationCreated={handleAnnotationCreated}
      />
    </div>
  );
}
