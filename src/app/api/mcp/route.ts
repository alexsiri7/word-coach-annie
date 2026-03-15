import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { server } from "@/mcp";

let transport: WebStandardStreamableHTTPServerTransport | null = null;

async function getTransport(): Promise<WebStandardStreamableHTTPServerTransport> {
    if (!transport) {
        transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: undefined, // stateless mode
            enableJsonResponse: true,
        });
        await server.connect(transport);
    }
    return transport;
}

export async function POST(req: Request): Promise<Response> {
    const t = await getTransport();
    return t.handleRequest(req);
}

export async function GET(req: Request): Promise<Response> {
    const t = await getTransport();
    return t.handleRequest(req);
}

export async function DELETE(req: Request): Promise<Response> {
    const t = await getTransport();
    return t.handleRequest(req);
}
