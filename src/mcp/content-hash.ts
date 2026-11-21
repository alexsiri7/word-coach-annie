import { UserFacingError } from "@/lib/controllers/errors";

export { computeContentHash } from "@/lib/content-hash";

/**
 * Error thrown when a write operation detects a stale hash.
 */
export class StaleWriteError extends UserFacingError {
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
