import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SpanStatusCode } from "@opentelemetry/api";
import type { ZodRawShape } from "zod";
import type { ToolSpec } from "@/lib/ai/tool-catalog";
import { DESTRUCTIVE_TOOL_DISABLED_MESSAGE } from "@/lib/env";
import { getTracer } from "@/lib/telemetry";

/** What every MCP tool registration for one server instance shares. */
export interface RegisterContext {
    server: McpServer;
    /** Authenticated user, or null in single-user mode. */
    userId: string | null;
    allowDestructive: boolean;
    /** A personal API token's tool allowlist; null means every tool. */
    allowedTools: ReadonlySet<string> | null;
}

/**
 * Registers `spec` on the MCP server with `handler`, unless the token scope excludes it.
 * The handler runs inside an `mcp.tool.<name>` span; a destructive spec is refused
 * with an error result while destructive tools are disabled.
 */
export function registerTool<Shape extends ZodRawShape>(
    ctx: RegisterContext,
    spec: ToolSpec<Shape>,
    handler: ToolCallback<Shape>,
): void {
    if (ctx.allowedTools && !ctx.allowedTools.has(spec.name)) return;
    const run = handler as (...args: unknown[]) => unknown;

    const traced = (...args: unknown[]) =>
        getTracer().startActiveSpan(`mcp.tool.${spec.name}`, async (span) => {
            try {
                span.setAttribute("mcp.tool.name", spec.name);
                const result = spec.destructive && !ctx.allowDestructive
                    ? { content: [{ type: "text", text: DESTRUCTIVE_TOOL_DISABLED_MESSAGE }], isError: true }
                    : await run(...args);
                span.setStatus({ code: SpanStatusCode.OK });
                return result;
            } catch (err) {
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: err instanceof Error ? err.message : String(err),
                });
                throw err;
            } finally {
                span.end();
            }
        });

    ctx.server.tool(spec.name, spec.description, spec.parameters.shape, traced as unknown as ToolCallback<Shape>);
}
