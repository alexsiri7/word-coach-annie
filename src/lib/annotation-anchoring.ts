import type { AnnotationRange, TextQuoteRange } from "@/lib/types";

/**
 * Parse an `Annotation.range` JSON string into its typed shape.
 *
 * Two independent creation paths write to this same column with different
 * shapes: the editor's own TipTap extension stores ProseMirror positions
 * (`{ from, to }`), while the Reader view (which has no ProseMirror document
 * to address into) stores a W3C-style text-quote selector
 * (`{ type: "textQuote", selectedText, prefix, suffix }`). Callers should
 * check `range.type === "textQuote"` to disambiguate — ProseRange has no
 * `type` field.
 */
export function parseAnnotationRange(range: string | null | undefined): AnnotationRange | null {
  if (!range) return null;
  try {
    return JSON.parse(range);
  } catch {
    return null;
  }
}

export function isTextQuoteRange(range: AnnotationRange | null): range is TextQuoteRange {
  return !!range && (range as TextQuoteRange).type === "textQuote";
}

export interface OffsetRange {
  start: number;
  end: number;
}

export interface TextQuoteAnchor {
  quote: string;
  prefix?: string;
  suffix?: string;
}

/**
 * Resolve a text-quote anchor (a quote plus optional prefix/suffix context,
 * mirroring the W3C Web Annotation "text quote selector") against a
 * flattened text string, returning character offsets into that string.
 *
 * Pure — no DOM or ProseMirror dependency — so both the Reader view (which
 * flattens DOM text nodes) and the editor (which flattens ProseMirror text
 * nodes) can reuse the exact same matching logic instead of maintaining two
 * copies that can drift apart.
 *
 * Tries progressively looser matches — prefix+quote+suffix, then
 * prefix+quote, then quote+suffix, then a bare quote — and returns null
 * (rather than guessing) if nothing matches, e.g. because the surrounding
 * text was edited after the annotation was created.
 *
 * Callers resolving MULTIPLE annotations against the same document MUST
 * call this once per annotation against one unmutated `fullText` computed
 * up front, not against a `fullText` re-derived after earlier annotations
 * have already been wrapped in highlight markup — re-deriving from a
 * DOM/doc tree that earlier highlights have already mutated silently
 * corrupts the search space for every annotation processed afterward.
 */
export function resolveTextQuote(fullText: string, anchor: TextQuoteAnchor): OffsetRange | null {
  const { quote, prefix = "", suffix = "" } = anchor;
  if (!quote) return null;

  let idx = -1;
  if (prefix && suffix) {
    idx = fullText.indexOf(prefix + quote + suffix);
    if (idx !== -1) idx += prefix.length;
  }
  if (idx === -1 && prefix) {
    idx = fullText.indexOf(prefix + quote);
    if (idx !== -1) idx += prefix.length;
  }
  if (idx === -1 && suffix) {
    idx = fullText.indexOf(quote + suffix);
  }
  if (idx === -1) {
    idx = fullText.indexOf(quote);
  }
  if (idx === -1) return null;

  return { start: idx, end: idx + quote.length };
}

export interface ResolvedAnnotationRange {
  id: string;
  start: number;
  end: number;
}

export interface AnchorableAnnotation {
  id: string;
  range: string | null | undefined;
  selectedText?: string | null;
}

/**
 * Resolve a batch of annotations against one flattened `fullText`, each
 * independently (order-independent — none of the matches depend on any
 * other annotation having been "applied" first, since nothing here mutates
 * `fullText`). Callers that go on to mutate a tree to render each match
 * (inserting highlight wrapper elements/marks) should apply the results in
 * descending `start` order so that earlier insertions never invalidate the
 * node/position bookkeeping for matches still pending.
 */
export function resolveAnnotationRanges(
  fullText: string,
  annotations: AnchorableAnnotation[]
): ResolvedAnnotationRange[] {
  const resolved: ResolvedAnnotationRange[] = [];
  for (const annotation of annotations) {
    if (!annotation.selectedText) continue;
    const parsed = parseAnnotationRange(annotation.range);
    const prefix = isTextQuoteRange(parsed) ? parsed.prefix ?? "" : "";
    const suffix = isTextQuoteRange(parsed) ? parsed.suffix ?? "" : "";
    const match = resolveTextQuote(fullText, { quote: annotation.selectedText, prefix, suffix });
    if (match) resolved.push({ id: annotation.id, start: match.start, end: match.end });
  }
  return resolved.sort((a, b) => b.start - a.start);
}
