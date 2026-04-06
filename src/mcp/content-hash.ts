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

/**
 * Error thrown when a write operation detects a stale hash.
 */
export class StaleWriteError extends Error {
    constructor(readTool: string) {
        super(
            `Stale write rejected: the content has been modified since you last read it. ` +
            `Call \`${readTool}\` to obtain the current contentHash before writing.`
        );
        this.name = "StaleWriteError";
    }
}

/**
 * Verify that the provided hash matches the current computed hash.
 * Throws StaleWriteError if they differ.
 */
export function verifyContentHash(
    providedHash: string,
    currentHash: string,
    readTool: string
): void {
    if (providedHash !== currentHash) {
        throw new StaleWriteError(readTool);
    }
}
