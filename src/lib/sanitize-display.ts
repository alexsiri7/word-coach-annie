import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize stored rich HTML (scene content, version snapshots) for rendering
 * via `dangerouslySetInnerHTML`. Stored content may carry `style=` attributes
 * (pasted rich text keeps them, and `sanitizeHtml` allows them), but the CSP's
 * `style-src` permits no inline style attributes, so they are stripped here.
 */
export function sanitizeDisplayHtml(html: string, addTags: string[] = []): string {
  return DOMPurify.sanitize(html, { ADD_TAGS: addTags, FORBID_ATTR: ["style"] });
}
