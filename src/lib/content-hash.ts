import { createHash } from "crypto";

/**
 * Compute a SHA-256 hash over the provided fields (nullish values treated as "").
 * Fields are joined with a null byte to avoid cross-field collisions.
 *
 * Returned in each read response as `contentHash`. Write tools require this value
 * to confirm the caller read the current version before overwriting.
 */
export function computeContentHash(...fields: (string | null | undefined)[]): string {
    const content = fields.map(f => f ?? "").join("\0");
    return createHash("sha256").update(content).digest("hex");
}
