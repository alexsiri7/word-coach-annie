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
