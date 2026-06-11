import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as Sentry from "@sentry/nextjs";
import { createServer } from "@/mcp";
import { logger } from "@/lib/logger";
import { isAuthEnabled } from "@/lib/auth";

async function handleMcpRequest(req: Request): Promise<Response> {
    try {
        const userId = req.headers.get("x-user-id");

        if (!userId && isAuthEnabled()) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            });
        }

        if (userId) Sentry.setUser({ id: userId });
        const server = createServer({ userId });
        const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: undefined, // stateless mode
            enableJsonResponse: true,
        });
        await server.connect(transport);
        const response = await transport.handleRequest(req);
        await server.close();
        return response;
    } catch (error) {
        logger.error("MCP request error", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}

export async function POST(req: Request): Promise<Response> { return handleMcpRequest(req); }
export async function GET(req: Request): Promise<Response> { return handleMcpRequest(req); }
export async function DELETE(req: Request): Promise<Response> { return handleMcpRequest(req); }
