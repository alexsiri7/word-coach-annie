import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "@/mcp";

async function handleMcpRequest(req: Request): Promise<Response> {
    const server = createServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless mode
        enableJsonResponse: true,
    });
    await server.connect(transport);
    const response = await transport.handleRequest(req);
    await server.close();
    return response;
}

export async function POST(req: Request): Promise<Response> { return handleMcpRequest(req); }
export async function GET(req: Request): Promise<Response> { return handleMcpRequest(req); }
export async function DELETE(req: Request): Promise<Response> { return handleMcpRequest(req); }
