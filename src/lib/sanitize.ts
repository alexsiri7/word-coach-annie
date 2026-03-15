import DOMPurify from "dompurify";

/**
 * Sanitize user-provided text content to prevent XSS.
 * Strips all HTML tags — the content should be plain text or markdown
 * (ReactMarkdown handles markdown→React rendering safely).
 */
export function sanitizeMessageContent(content: string): string {
  // DOMPurify with no allowed tags strips all HTML while decoding entities
  return DOMPurify.sanitize(content, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
