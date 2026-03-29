"use client";

import { useState, useMemo } from "react";
import { List, X as XIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

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
      const text = node.content.replace(/<[^>]+>/g, "").replace(/<!-- beat:[\s\S]*?-->/g, "");
      count += text.split(/\s+/).filter(Boolean).length;
    }
    count += countWords(node.children);
  }
  return count;
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

/** Check if a node (or its descendants) has any content */
function _hasContent(node: OutlineNode): boolean {
  if (node.type === "SCENE" && node.content && node.content !== "<p></p>") return true;
  return node.children.some(_hasContent);
}

function SceneContent({ content }: { content: string }) {
  const cleaned = stripBeats(content);
  if (!cleaned || cleaned === "<p></p>") return null;

  // Sanitize HTML to prevent XSS — content may come from another user via sharing
  const sanitized = useMemo(() => {
    if (typeof window === "undefined") return cleaned;
    const DOMPurify = require("dompurify");
    return DOMPurify.sanitize(cleaned);
  }, [cleaned]);

  return (
    <div
      className="reader-prose"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

function ManuscriptNode({
  node,
  chapterCounter,
}: {
  node: OutlineNode;
  chapterCounter: { value: number };
}) {
  if (node.type === "PART") {
    return (
      <section id={node.id} className="mt-16 mb-8 first:mt-8">
        <h2 className="font-sans text-3xl sm:text-4xl font-bold text-text-primary text-center tracking-tight mb-2">
          {node.title}
        </h2>
        <div className="flex justify-center my-6">
          <div className="w-16 h-px bg-border" />
        </div>
        {node.children.map((child) => (
          <ManuscriptNode
            key={child.id}
            node={child}
            chapterCounter={chapterCounter}
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
      <section id={node.id} className="mt-12 mb-8">
        <h3 className="font-sans text-xl sm:text-2xl font-semibold text-text-primary text-center tracking-tight mb-1">
          <span className="block text-sm font-normal text-text-muted uppercase tracking-widest mb-1">
            Chapter {chapterCounter.value}
          </span>
          {node.title}
        </h3>
        <div className="flex justify-center my-6">
          <div className="w-8 h-px bg-border" />
        </div>
        {hasAnyContent ? (
          scenes.map((scene, i) => (
            <div key={scene.id}>
              {i > 0 && scene.content && scene.content !== "<p></p>" && (
                <div className="flex justify-center my-8">
                  <span className="text-text-muted tracking-[0.5em] text-sm select-none">
                    * * *
                  </span>
                </div>
              )}
              <SceneContent content={scene.content || ""} />
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
        <SceneContent content={node.content} />
      </section>
    );
  }

  return null;
}

export function ReaderView({ project, outline }: ReaderViewProps) {
  const [tocOpen, setTocOpen] = useState(false);
  const tocEntries = collectTocEntries(outline);
  const wordCount = countWords(outline);
  const chapterCounter = { value: 0 };

  const handleTocClick = (id: string) => {
    setTocOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top accent line */}
      <div className="h-0.5 accent-gradient" />

      {/* Floating controls */}
      <div className="fixed top-3 right-3 z-50 flex items-center gap-1.5">
        <ThemeToggle />
        {tocEntries.length > 0 && (
          <button
            onClick={() => setTocOpen(!tocOpen)}
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center transition-colors",
              "bg-surface-raised border border-border shadow-sm",
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

      {/* Table of contents drawer */}
      {tocOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setTocOpen(false)}
          />
          <nav className="fixed top-0 right-0 z-50 h-full w-80 max-w-[85vw] bg-surface-raised border-l border-border shadow-2xl overflow-y-auto animate-slide-in-right">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-text-muted">
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

      {/* Title page */}
      <header className="pt-16 pb-12 sm:pt-24 sm:pb-16 px-4">
        <div className="max-w-[700px] mx-auto text-center">
          <h1 className="font-serif text-4xl sm:text-5xl font-bold text-text-primary leading-tight tracking-tight mb-4">
            {project.title}
          </h1>
          {project.author && (
            <p className="text-lg text-text-secondary mb-2">
              by {project.author}
            </p>
          )}
          {project.genre && (
            <span className="tag-pill">{project.genre}</span>
          )}
          {wordCount > 0 && (
            <p className="text-sm text-text-muted mt-4">
              {wordCount.toLocaleString()} words
            </p>
          )}
        </div>
      </header>

      {/* Divider */}
      <div className="flex justify-center mb-8">
        <div className="w-24 h-px bg-border" />
      </div>

      {/* Manuscript body */}
      <main id="main-content" className="px-4 pb-16">
        <article className="max-w-[700px] mx-auto">
          {outline.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-text-muted italic">
                This manuscript has no content yet.
              </p>
            </div>
          ) : (
            outline.map((node) => (
              <ManuscriptNode
                key={node.id}
                node={node}
                chapterCounter={chapterCounter}
              />
            ))
          )}

          {/* End of manuscript */}
          {outline.length > 0 && (
            <footer className="mt-16 mb-8 text-center">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-px bg-border" />
              </div>
              <p className="text-sm text-text-muted italic tracking-wide">
                End of manuscript
              </p>
            </footer>
          )}
        </article>
      </main>
    </div>
  );
}
