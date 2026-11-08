import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-auth")>();
    return { ...actual, getCurrentUserId: vi.fn(() => "user-1") };
});

vi.mock("@/lib/controllers/google-auth", () => ({
    GoogleAuthController: { disconnect: vi.fn() },
}));

vi.mock("@/lib/controllers/hashnode-auth", () => ({
    HashnodeAuthController: { disconnect: vi.fn() },
    HashnodeAuthError: class extends Error {},
}));

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GoogleAuthController } from "@/lib/controllers/google-auth";
import { HashnodeAuthController } from "@/lib/controllers/hashnode-auth";
import { DELETE as deleteGoogleDocs } from "@/app/api/integrations/google-docs/route";
import { DELETE as deleteHashnode } from "@/app/api/integrations/hashnode/route";

function disconnectRequest(path: string, headers: Record<string, string> = {}): NextRequest {
    return new NextRequest(`http://localhost${path}`, { method: "DELETE", headers });
}

describe.each([
    {
        path: "/api/integrations/google-docs",
        handler: deleteGoogleDocs,
        disconnect: vi.mocked(GoogleAuthController.disconnect),
    },
    {
        path: "/api/integrations/hashnode",
        handler: deleteHashnode,
        disconnect: vi.mocked(HashnodeAuthController.disconnect),
    },
])("DELETE $path", ({ path, handler, disconnect }) => {
    beforeEach(() => {
        disconnect.mockResolvedValue(undefined);
    });

    it("rejects a request without the CSRF header and keeps the credential", async () => {
        expect((await handler(disconnectRequest(path))).status).toBe(403);
        expect(disconnect).not.toHaveBeenCalled();
    });

    it("rejects a CSRF header other than \"1\"", async () => {
        const res = await handler(disconnectRequest(path, { "x-csrf-protection": "true" }));
        expect(res.status).toBe(403);
        expect(disconnect).not.toHaveBeenCalled();
    });

    it("disconnects the current user when the CSRF header is present", async () => {
        const res = await handler(disconnectRequest(path, { "x-csrf-protection": "1" }));
        expect(res.status).toBe(200);
        expect(disconnect).toHaveBeenCalledWith("user-1");
    });
});
