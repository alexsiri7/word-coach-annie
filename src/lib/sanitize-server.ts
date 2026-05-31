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
 *
 * Beat comments (`<!-- beat: ... -->`) are preserved — DOMPurify strips HTML
 * comments by default, so we extract them before sanitization and restore after.
 */
export function sanitizeHtml(input: string): string {
  // Extract beat comments before DOMPurify strips them
  const beats: string[] = [];
  const withPlaceholders = input.replace(/(<!-- beat:[\s\S]*?-->)/g, (match) => {
    const idx = beats.length;
    beats.push(match);
    return `<span data-beat-placeholder="${idx}"></span>`;
  });

  const sanitized = DOMPurify.sanitize(withPlaceholders, {
    ADD_ATTR: ["data-beat-placeholder"],
  });

  // Restore beat comments
  return sanitized.replace(/<span data-beat-placeholder="(\d+)"><\/span>/g, (_, idx) => {
    return beats[parseInt(idx, 10)];
  });
}

/**
 * Escape a string for safe embedding in GitHub-flavored Markdown.
 * Prevents markdown injection (e.g., link injection, image injection)
 * when user-provided values are interpolated into issue bodies.
 */
export function escapeMarkdown(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[*_~#|{}\[\]()!`]/g, "\\$&");
}

/**
 * Escape a string for safe embedding in an HTML attribute or text node.
 * Use when interpolating user-supplied values into HTML template literals.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Wraps user-controlled content in XML-like tags to signal to the LLM
 * that this is user-provided data, not instructions. Mitigates prompt injection.
 *
 * Use this for user-controlled strings embedded in AI prompts. Prefer this helper
 * over inline template literals so that encoding changes only need one update.
 *
 * NOTE: Content is NOT escaped. If user content contains the closing tag string
 * (e.g. "</manuscript>"), it will structurally break the XML boundary.
 * This is intentional: the system-prompt instruction ("treat as data") is the
 * primary defence, not XML parsing. Do not use in strict XML contexts.
 *
 * Example: wrapUserContent("project-title", project.title)
 * → "<project-title>My Story</project-title>"
 */
export function wrapUserContent(tag: string, content: string): string {
  return `<${tag}>${content}</${tag}>`;
}
