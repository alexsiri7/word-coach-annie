/**
 * Server-side input sanitization for chat messages.
 * Strips HTML tags to prevent stored XSS attacks.
 * This runs on the API route (Node.js) where DOMPurify isn't available.
 */
export function sanitizeInput(input: string): string {
  // Strip HTML tags — user chat messages should be plain text
  return input.replace(/<[^>]*>/g, "");
}
