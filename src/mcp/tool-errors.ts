import { UserFacingError } from "@/lib/controllers/errors";
import { StaleWriteError } from "@/mcp/content-hash";
import { logger } from "@/lib/logger";

export type McpResult = { content: [{ type: "text"; text: string }]; isError?: true };

/**
 * Tool error result for an MCP client. Only a UserFacingError's message is
 * shown; anything else (Prisma, crypto, upstream API text) stays in the server
 * log behind a generic reason.
 */
export function toolError(errorPrefix: string, e: unknown): McpResult {
    const reason = e instanceof UserFacingError ? e.message : "an unexpected error occurred";
    return { content: [{ type: "text", text: `${errorPrefix}: ${reason}` }], isError: true };
}

/** Shared try-catch wrapper for tool handlers that return JSON results. */
export async function mcpRun(
    logLabel: string,
    errorPrefix: string,
    fn: () => Promise<unknown>
): Promise<McpResult> {
    try {
        const result = await fn();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
        if (e instanceof StaleWriteError) {
            logger.warn(`${logLabel}: stale write rejected`, e);
        } else {
            logger.error(`${logLabel}: failed`, e);
        }
        return toolError(errorPrefix, e);
    }
}
