import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

vi.mock("@/lib/api-auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-auth")>();
    return { ...actual, getCurrentUserId: vi.fn(() => null as string | null) };
});

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getCurrentUserId } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { verifyPersonalToken } from "@/lib/personal-tokens";
import { ProjectsController } from "@/lib/controllers/projects";
import { StructureController } from "@/lib/controllers/structure";
import { GET, POST } from "@/app/api/account/api-tokens/route";
import { DELETE } from "@/app/api/account/api-tokens/[id]/route";

const USER_ID = "token-owner";

function request(method: string, body?: unknown, csrf = true): NextRequest {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (csrf) headers["x-csrf-protection"] = "1";
    return new NextRequest("http://localhost/api/account/api-tokens", {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

async function createToken(scope: "read" | "write" = "write"): Promise<{ token: string; id: string }> {
    const res = await POST(request("POST", { name: "Punland editor", scope }));
    expect(res.status).toBe(201);
    const data = await res.json();
    return { token: data.token, id: data.apiToken.id };
}

function revoke(id: string) {
    return DELETE(request("DELETE"), { params: Promise.resolve({ id }) });
}

describe("/api/account/api-tokens", () => {
    beforeEach(async () => {
        await prisma.user.create({ data: { id: USER_ID, email: "owner@test.com", googleId: "google-owner" } });
        vi.mocked(getCurrentUserId).mockReturnValue(USER_ID);
    });

    it("shows a new token once, then lists it without the secret", async () => {
        const { token, id } = await createToken();
        expect(token).toMatch(/^annie_pat_/);

        const res = await GET(request("GET"));
        expect(res.status).toBe(200);
        const { tokens } = await res.json();
        expect(tokens).toHaveLength(1);
        expect(tokens[0]).toMatchObject({ id, name: "Punland editor", scope: "write", hint: token.slice(-4) });
        expect(JSON.stringify(tokens)).not.toContain(token);
        expect(tokens[0]).not.toHaveProperty("tokenHash");
    });

    it("never logs the token", async () => {
        const { token } = await createToken();
        const logged = JSON.stringify([
            vi.mocked(logger.info).mock.calls,
            vi.mocked(logger.warn).mock.calls,
            vi.mocked(logger.error).mock.calls,
        ]);
        expect(logged).not.toContain(token);
    });

    it("creates a token that may only post location snapshots", async () => {
        const res = await POST(request("POST", { name: "Punland snapshot job", scope: "snapshots" }));
        expect(res.status).toBe(201);
        expect((await res.json()).apiToken).toMatchObject({ scope: "snapshots" });
    });

    it("requires the CSRF header to create", async () => {
        expect((await POST(request("POST", { name: "x", scope: "read" }, false))).status).toBe(403);
    });

    it.each([
        [{ name: "", scope: "read" }],
        [{ name: "   ", scope: "read" }],
        [{ name: "x".repeat(101), scope: "read" }],
        [{ name: "x", scope: "admin" }],
        [{ name: "x" }],
        [undefined],
    ])("rejects %j with 400", async (body) => {
        expect((await POST(request("POST", body))).status).toBe(400);
    });

    it("requires a signed-in user", async () => {
        vi.mocked(getCurrentUserId).mockReturnValue(null);
        expect((await GET(request("GET"))).status).toBe(401);
        expect((await POST(request("POST", { name: "x", scope: "read" }))).status).toBe(401);
        expect((await revoke("any")).status).toBe(401);
    });

    it("revokes a token so it no longer authenticates", async () => {
        const { token, id } = await createToken();
        const res = await revoke(id);
        expect(res.status).toBe(200);
        expect(await verifyPersonalToken(token)).toBeNull();
        expect((await revoke(id)).status).toBe(404);
    });

    it("refuses to revoke another user's token", async () => {
        const { token, id } = await createToken();
        await prisma.user.create({ data: { id: "intruder", email: "intruder@test.com", googleId: "google-intruder" } });
        vi.mocked(getCurrentUserId).mockReturnValue("intruder");
        expect((await revoke(id)).status).toBe(404);
        expect(await verifyPersonalToken(token)).not.toBeNull();
    });

    it("lets a script replace a beat that the editor and version history then show", async () => {
        const project = await ProjectsController.createProject({ title: "Punland", userId: USER_ID });
        const scene = await StructureController.createNode({ projectId: project.id, type: "SCENE", title: "Gate" });
        await StructureController.writeSceneContent(scene.id, "<p>Prose</p><!-- beat: Old beat --><p>More</p>");
        const versionsBefore = await prisma.contentVersion.count({ where: { nodeId: scene.id } });

        const { token } = await createToken("write");
        const identity = await verifyPersonalToken(token);
        expect(identity).not.toBeNull();

        const { createServer } = await import("@/mcp/index");
        const server = createServer({ userId: identity!.userId, tokenScope: identity!.scope });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: "punland", version: "1.0.0" });
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

        const read = await client.callTool({ name: "read_scene_content", arguments: { nodeId: scene.id } });
        const { paragraphs } = JSON.parse((read.content as Array<{ text: string }>)[0].text);
        const beat = paragraphs.find((p: { type: string }) => p.type === "BEAT");
        expect(beat.content).toBe("Old beat");

        const updated = await client.callTool({
            name: "update_paragraph",
            arguments: { nodeId: scene.id, index: beat.index, content: "New beat", paragraphContentHash: beat.contentHash },
        });
        expect(updated.isError).toBeFalsy();
        await client.close();

        expect(await prisma.contentVersion.count({ where: { nodeId: scene.id } })).toBe(versionsBefore + 1);

        const { GET: getContent } = await import("@/app/api/nodes/[id]/content/route");
        const res = await getContent(
            new NextRequest(`http://localhost/api/nodes/${scene.id}/content`, {
                headers: { "x-user-id": identity!.userId, "x-user-email": identity!.email },
            }),
            { params: Promise.resolve({ id: scene.id }) }
        );
        expect(res.status).toBe(200);
        expect(JSON.stringify(await res.json())).toContain("New beat");
    });
});
