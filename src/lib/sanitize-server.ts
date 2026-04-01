import DOMPurify from "isomorphic-dompurify";

/**
 * Strip all HTML tags from input — for plain text fields like chat messages,
 * story object names, project titles, etc.
 *
 * Uses DOMPurify with zero allowed tags for robust stripping that handles
 * edge cases the previous regex missed (unclosed tags, encoded entities, etc.).
 */
export function sanitizeInput(input: string): string {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/**
 * Sanitize rich HTML content (e.g., TipTap editor output) — allows safe
 * formatting tags but strips scripts, event handlers, and dangerous elements.
 *
 * Used as defense-in-depth for scene content before database storage.
 * The client also sanitizes on read via DOMPurify.
 */
export function sanitizeHtml(input: string): string {
  return DOMPurify.sanitize(input);
}

/**
 * Escape a string for safe embedding in GitHub-flavored Markdown.
 * Prevents markdown injection (e.g., link injection, image injection)
 * when user-provided values are interpolated into issue bodies.
 */
export function escapeMarkdown(input: string): string {
  // Replace characters that have meaning in Markdown/HTML
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/!/g, "\\!")
    .replace(/`/g, "\\`");
}
