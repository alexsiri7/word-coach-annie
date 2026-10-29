/**
 * Removes beat annotations in both storage formats: the HTML comment the
 * editor's save path writes (`<!-- beat: ... -->`) and the TipTap node div
 * (`data-type="beat-annotation"`) that MCP or direct writes can store as-is.
 */
export function stripBeats(html: string): string {
  return html
    .replace(/<div[^>]*data-type="beat-annotation"[^>]*>[\s\S]*?<\/div>/g, "")
    .replace(/<!--\s*beat:[\s\S]*?-->/gi, "");
}

export function countSceneWords(html: string): number {
  // Tags become spaces so adjacent tags don't merge words.
  const prose = stripBeats(html).replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
  return prose === "" ? 0 : prose.split(/\s+/).length;
}

/** Decodes the entities TipTap and the export helpers emit. `&amp;` goes last so `&amp;lt;` stays the literal text `&lt;`. */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&amp;/g, "&");
}

/** Plain-text scene prose for the PDF and DOCX exports: beats removed, paragraphs separated by a blank line. */
export function sceneHtmlToPlainText(html: string): string {
  if (!html || html === "<p></p>") return "";
  let text = stripBeats(html);
  text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = decodeHtmlEntities(text);
  return text.replace(/\n{3,}/g, "\n\n").trim();
}
