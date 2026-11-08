import type { WebStandardStreamableHTTPServerTransportOptions } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export const mcpTransportOptions: WebStandardStreamableHTTPServerTransportOptions = {
    sessionIdGenerator: undefined, // stateless mode
    enableJsonResponse: true,
};
