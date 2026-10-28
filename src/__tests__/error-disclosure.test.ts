import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/api-auth", () => ({
    getCurrentUserId: vi.fn(() => "test-user-id"),
    verifyProjectWriteAccess: vi.fn(async () => ({ authorized: true })),
    validateCsrfHeader: vi.fn(() => null),
}));

vi.mock("@/lib/export/google-docs-comment-sync", () => ({
    GoogleDocsCommentSync: { syncComments: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { POST as connectHashnode } from "@/app/api/integrations/hashnode/route";
import { POST as syncGoogleComments } from "@/app/api/integrations/google-docs/route";
import { opportunityErrorResponse } from "@/app/api/opportunities/errors";
import { GoogleDocsCommentSync } from "@/lib/export/google-docs-comment-sync";
import { ConflictError } from "@/lib/controllers/opportunities";
import { NotFoundError, UpstreamServiceError } from "@/lib/controllers/errors";
import { AccessDeniedError } from "@/lib/ownership";
import { StaleWriteError } from "@/mcp/content-hash";
import { mcpRun } from "@/mcp/tool-errors";
import { logger } from "@/lib/logger";

const UPSTREAM_SECRET = "upstream-body-with-internal-detail";

function postJson(url: string, body: unknown): NextRequest {
    return new NextRequest(url, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
    });
}

function hashnodeMeResponse(): Response {
    return new Response(
        JSON.stringify({ data: { me: { username: "writer", publications: { edges: [{ node: { id: "pub-1" } }] } } } }),
        { status: 200, headers: { "content-type": "application/json" } }
    );
}

describe("POST /api/integrations/hashnode error responses", () => {
    const connect = () => connectHashnode(postJson("http://localhost/api/integrations/hashnode", { accessToken: "tok" }));
    const savedEnv = { ...process.env };

    afterEach(() => {
        vi.unstubAllGlobals();
        process.env = { ...savedEnv };
    });

    it("hides the encryption configuration error behind a generic 500", async () => {
        delete process.env.ENCRYPTION_KEY;
        process.env.ALLOW_PLAINTEXT_STORAGE = "false";
        vi.stubGlobal("fetch", vi.fn(async () => hashnodeMeResponse()));

        const res = await connect();
        const text = await res.text();

        expect(res.status).toBe(500);
        expect(JSON.parse(text)).toEqual({ error: "Internal server error" });
        expect(text).not.toContain("ENCRYPTION_KEY");
    });

    it("hides an upstream 4xx body behind 502 'Upstream service error'", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(UPSTREAM_SECRET, { status: 403 })));

        const res = await connect();
        const text = await res.text();

        expect(res.status).toBe(502);
        expect(JSON.parse(text)).toEqual({ error: "Upstream service error" });
        expect(text).not.toContain(UPSTREAM_SECRET);
    });

    it("returns a fixed 401 when Hashnode rejects the token", async () => {
        vi.stubGlobal("fetch", vi.fn(async () =>
            new Response(JSON.stringify({ errors: [{ message: UPSTREAM_SECRET }] }), { status: 200 })
        ));

        const res = await connect();
        const text = await res.text();

        expect(res.status).toBe(401);
        expect(JSON.parse(text)).toEqual({ error: "Invalid Hashnode token" });
    });
});

describe("POST /api/integrations/google-docs error responses", () => {
    const sync = () => syncGoogleComments(postJson("http://localhost/api/integrations/google-docs", { projectId: "p1" }));

    it("returns 404 when the project has no export", async () => {
        vi.mocked(GoogleDocsCommentSync.syncComments).mockRejectedValueOnce(
            new NotFoundError("No Google Doc export found for this project. Export the project first.")
        );

        const res = await sync();
        expect(res.status).toBe(404);
    });

    it("hides Google API error text behind 502 'Upstream service error'", async () => {
        vi.mocked(GoogleDocsCommentSync.syncComments).mockRejectedValueOnce(
            new UpstreamServiceError(`Failed to fetch comments from Google Docs: ${UPSTREAM_SECRET}`)
        );

        const res = await sync();
        const text = await res.text();

        expect(res.status).toBe(502);
        expect(JSON.parse(text)).toEqual({ error: "Upstream service error" });
    });

    it("hides any other error behind a generic 500", async () => {
        vi.mocked(GoogleDocsCommentSync.syncComments).mockRejectedValueOnce(new Error(UPSTREAM_SECRET));

        const res = await sync();
        expect(res.status).toBe(500);
        expect(await res.text()).not.toContain(UPSTREAM_SECRET);
    });
});

describe("opportunityErrorResponse", () => {
    it.each([
        [new NotFoundError("Opportunity not found: opp-internal-id"), 404],
        [new ConflictError("Candidate was already promoted to submission sub-internal-id"), 409],
    ])("returns a fixed %s message without internal ids", async (error, status) => {
        const res = opportunityErrorResponse("test", error);
        expect(res.status).toBe(status);
        expect(await res.text()).not.toContain("internal-id");
    });
});

describe("mcpRun error text", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns no raw message for a Prisma error", async () => {
        const prismaError = new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed on the fields: (`"Project"."secretColumn"`)',
            { code: "P2002", clientVersion: "test" }
        );

        const result = await mcpRun("test_tool", "Error testing", async () => { throw prismaError; });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe("Error testing: an unexpected error occurred");
        expect(logger.error).toHaveBeenCalledWith("test_tool: failed", prismaError);
    });

    it("passes a stale-write rejection through and logs it as a warning", async () => {
        const stale = new StaleWriteError("get_scene");

        const result = await mcpRun("test_tool", "Error testing", async () => { throw stale; });

        expect(result.content[0].text).toBe(`Error testing: ${stale.message}`);
        expect(logger.warn).toHaveBeenCalledWith("test_tool: stale write rejected", stale);
        expect(logger.error).not.toHaveBeenCalled();
    });

    it("passes an access-denied error through", async () => {
        const result = await mcpRun("test_tool", "Error testing", async () => { throw new AccessDeniedError("Project"); });

        expect(result.content[0].text).toBe("Error testing: Project not found or access denied");
    });
});
