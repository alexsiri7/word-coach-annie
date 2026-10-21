import type { OutlineNode } from "@/lib/outline-tree";
import { escapeHtml, sanitizeHtml } from "@/lib/sanitize-server";
import { stripBeats } from "@/lib/scene-text";

export function isEmptyContent(content: string | undefined): boolean {
  if (!content) return true;
  const stripped = content.replace(/<p><\/p>/g, "").trim();
  return stripped.length === 0;
}

export interface EpubChapter {
  title: string;
  content: string;
}

// Sanitize after stripping beats: removing a comment could otherwise splice
// harmless fragments into live markup.
function safeSceneHtml(content: string): string {
  return sanitizeHtml(stripBeats(content));
}

export function buildEpubChapters(outline: OutlineNode[]): EpubChapter[] {
  const chapters: EpubChapter[] = [];

  function collectSceneHtml(node: OutlineNode): string {
    let html = "";
    for (const child of node.children) {
      if (child.type === "SCENE" && !isEmptyContent(child.content)) {
        html += safeSceneHtml(child.content!);
      }
    }
    return html;
  }

  function walk(node: OutlineNode) {
    if (node.type === "PART") {
      const partSceneHtml = collectSceneHtml(node);
      chapters.push({
        title: node.title,
        content: `<h1>${escapeHtml(node.title)}</h1>${partSceneHtml}`,
      });
      for (const child of node.children) {
        if (child.type !== "SCENE") walk(child);
      }
    } else if (node.type === "CHAPTER") {
      const sceneHtml = collectSceneHtml(node);
      chapters.push({
        title: node.title,
        content: `<h2>${escapeHtml(node.title)}</h2>${sceneHtml}`,
      });
    } else if (node.type === "SCENE" && !isEmptyContent(node.content)) {
      // Top-level scene (no parent chapter)
      chapters.push({
        title: node.title,
        content: safeSceneHtml(node.content!),
      });
    }
  }

  for (const node of outline) walk(node);
  return chapters;
}
