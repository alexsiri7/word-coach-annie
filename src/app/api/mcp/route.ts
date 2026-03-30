import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "@/mcp";
import { logger } from "@/lib/logger";

async function handleMcpRequest(req: Request): Promise<Response> {
    try {
        const server = createServer();
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
