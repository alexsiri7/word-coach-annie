import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
    McpServer: vi.fn().mockImplementation(() => ({
        tool: vi.fn(),
        connect: vi.fn(),
        close: vi.fn(),
    })),
}));

vi.mock("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js", () => ({
    WebStandardStreamableHTTPServerTransport: vi.fn().mockImplementation(() => ({
        handleRequest: vi.fn(async () => new Response("ok", { status: 200 })),
    })),
}));

vi.mock("@sentry/nextjs", () => ({
    setUser: vi.fn(),
}));

vi.mock("@/mcp", () => ({
    createServer: vi.fn(() => ({
        connect: vi.fn(),
        close: vi.fn(),
    })),
}));

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

let mockAuthEnabled = false;
vi.mock("@/lib/auth", () => ({
    isAuthEnabled: () => mockAuthEnabled,
}));

import { POST, GET, DELETE } from "../app/api/mcp/route";

describe("MCP route auth gate", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuthEnabled = false;
    });

    it("returns 401 when auth is enabled and no x-user-id header", async () => {
        mockAuthEnabled = true;
        const req = new Request("http://localhost/api/mcp", {
            method: "POST",
            body: "{}",
        });
        const res = await POST(req);
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toBe("Unauthorized");
    });

    it("allows request when auth is disabled and no x-user-id header", async () => {
        mockAuthEnabled = false;
        const req = new Request("http://localhost/api/mcp", {
            method: "POST",
            body: "{}",
        });
        const res = await POST(req);
        expect(res.status).not.toBe(401);
    });

    it("allows request when auth is enabled and x-user-id is present", async () => {
        mockAuthEnabled = true;
        const req = new Request("http://localhost/api/mcp", {
            method: "POST",
            headers: { "x-user-id": "user-123" },
            body: "{}",
        });
        const res = await POST(req);
        expect(res.status).not.toBe(401);
    });

    it("GET returns 401 when auth is enabled and no x-user-id header", async () => {
        mockAuthEnabled = true;
        const req = new Request("http://localhost/api/mcp", {
            method: "GET",
        });
        const res = await GET(req);
        expect(res.status).toBe(401);
    });

    it("DELETE returns 401 when auth is enabled and no x-user-id header", async () => {
        mockAuthEnabled = true;
        const req = new Request("http://localhost/api/mcp", {
            method: "DELETE",
        });
        const res = await DELETE(req);
        expect(res.status).toBe(401);
    });
});
