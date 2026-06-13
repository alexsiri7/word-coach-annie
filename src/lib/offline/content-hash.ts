/**
 * Browser- and service-worker-safe SHA-256 content hash.
 * Produces the same hex digest as the MCP-side Node.js computeContentHash
 * for identical input strings (both hash UTF-8 bytes via SHA-256).
 */
export async function computeOfflineContentHash(content: string): Promise<string> {
  const data = new TextEncoder().encode(content ?? "");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
