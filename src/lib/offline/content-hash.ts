/**
 * Computes a SHA-256 hex digest of the plain-text extracted from HTML content.
 * Used for optimistic-locking: the client records the hash of the last server-
 * confirmed version; on replay the server returns 409 if its latest hash differs.
 *
 * Works in browser context (SubtleCrypto) and service worker context.
 */
export async function computeContentHash(html: string): Promise<string> {
  // Strip HTML tags to extract comparable plain text for hashing.
  // Uses the same three regexes as StructureController.writeSceneContent's word-count.
  // Note: beat-annotation <div> stripping is intentionally omitted here because
  // content always arrives after beatsToComments() (annotations are HTML comments,
  // which are already handled by <[^>]*>).
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
