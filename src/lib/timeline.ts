import type { OutlineNode } from "@/lib/types";

export interface TimelineScene {
  id: string;
  title: string;
  status: string;
  orderIndex: number;
  chapterTitle?: string;
}

/**
 * Recursively traverses an outline node tree and collects all SCENE nodes,
 * propagating the nearest ancestor CHAPTER node's title as chapterTitle.
 * Non-CHAPTER, non-SCENE nodes (e.g. PART) are traversed but do not update
 * the chapterTitle propagated to their descendants.
 */
export function buildTimelineScenes(outlineNodes: OutlineNode[]): TimelineScene[] {
  const scenes: TimelineScene[] = [];
  function collectScenes(nodes: OutlineNode[], chapterTitle?: string) {
    for (const n of nodes) {
      if (n.type === "SCENE") {
        scenes.push({ id: n.id, title: n.title, status: n.status, orderIndex: n.orderIndex, chapterTitle });
      } else {
        collectScenes(n.children, n.type === "CHAPTER" ? n.title : chapterTitle);
      }
    }
  }
  collectScenes(outlineNodes);
  return scenes;
}
