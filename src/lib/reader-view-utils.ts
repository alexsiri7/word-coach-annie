/**
 * DOM utility functions for Read View annotation highlighting.
 * Extracted here to allow unit testing in a Node/jsdom environment.
 */

import type { AnnotationRange } from "@/lib/types";

export const PREFIX_SUFFIX_LEN = 32;

/**
 * Parses an annotation's `range` JSON string into a typed `AnnotationRange`, or
 * returns `null` for empty, missing, or malformed values. All parse failures are
 * warned to the console with the annotation ID for debuggability.
 */
export function parseAnnotationRange(range: string | null | undefined, annotationId?: string): AnnotationRange | null {
  if (!range) return null;
  try {
    return JSON.parse(range) as AnnotationRange;
  } catch {
    console.warn("reader-view: failed to parse annotation.range", { id: annotationId, range });
    return null;
  }
}

/**
 * Returns the absolute character offset of `targetOffset` within `targetNode`,
 * measured from the start of all text in `container` (matching the flat string
 * built by `applyHighlight`'s TreeWalker pass).
 *
 * When `targetNode` is an element node (e.g., a `<p>` at a selection boundary),
 * `targetOffset` counts child nodes, not characters — so this function sums text
 * lengths of all children before the `targetOffset`-th child of `targetNode`.
 *
 * Returns -1 if `targetNode` is not inside `container` (e.g., selection outside
 * the prose container). Callers should treat -1 as "no prefix" and skip
 * prefix-anchored matching.
 */
export function getTextOffset(container: Element, targetNode: Node, targetOffset: number): number {
  if (targetNode.nodeType !== Node.TEXT_NODE) {
    // targetNode is an element (e.g., <p> at a selection boundary).
    // targetOffset counts child nodes, not characters — sum text of children before that index.
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let total = 0;
    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) {
      let ancestor: Node | null = textNode;
      while (ancestor && ancestor.parentNode !== targetNode) ancestor = ancestor.parentNode;
      if (ancestor && Array.from(targetNode.childNodes).indexOf(ancestor as ChildNode) >= targetOffset) break;
      total += textNode.textContent?.length ?? 0;
    }
    return total;
  }
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0;
  let textNode: Text | null;
  while ((textNode = walker.nextNode() as Text | null)) {
    if (textNode === targetNode) return total + targetOffset;
    total += textNode.textContent?.length ?? 0;
  }
  return -1; // targetNode not found in container — caller should treat as no-prefix
}

/**
 * Wraps the first occurrence of `searchText` in `container` with a `<mark>` element,
 * disambiguating by `prefix` when provided. If `prefix + searchText` is not found,
 * falls back to the first occurrence of `searchText`. No-ops if `searchText` is empty
 * or not found at all.
 *
 * Skips text nodes already inside a `<mark>` element to prevent double-wrapping.
 */
export function applyHighlight(container: Element, searchText: string, annotationId: string, prefix = ""): void {
  if (!searchText) return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number }[] = [];
  let fullText = "";
  let textNode: Text | null;

  while ((textNode = walker.nextNode() as Text | null)) {
    if ((textNode.parentElement as HTMLElement)?.tagName === "MARK") continue;
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
  let startNode: Text | undefined, startOffset = 0;
  let endNode: Text | undefined, endOffset = 0;

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
