import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import {
    PERSONAL_TOKEN_PREFIX,
    createPersonalToken,
    hashPersonalToken,
    isPersonalTokenRequestAllowed,
    listPersonalTokens,
    revokePersonalToken,
    verifyPersonalToken,
} from "@/lib/personal-tokens";

describe("personal API tokens", () => {
    let userId: string;

    beforeEach(async () => {
        const user = await prisma.user.create({
            data: { id: "pat-user", email: "pat@test.com", googleId: "google-pat" },
        });
        userId = user.id;
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("verifies a new token as its user and scope, storing only its hash", async () => {
        const { token, apiToken } = await createPersonalToken(userId, "Game", "write");
        expect(token.startsWith(PERSONAL_TOKEN_PREFIX)).toBe(true);
        expect(apiToken.hint).toBe(token.slice(-4));

        expect(await verifyPersonalToken(token)).toEqual({
            tokenId: apiToken.id,
            userId,
            email: "pat@test.com",
            scope: "write",
        });

        const row = await prisma.apiToken.findUniqueOrThrow({ where: { id: apiToken.id } });
        expect(row.tokenHash).toBe(hashPersonalToken(token));
        expect(Object.values(row).some((v) => typeof v === "string" && v.includes(token))).toBe(false);
    });

    it("lists tokens without their hash", async () => {
        await createPersonalToken(userId, "Game", "read");
        const [listed] = await listPersonalTokens(userId);
        expect(listed.name).toBe("Game");
        expect(listed.scope).toBe("read");
        expect(listed).not.toHaveProperty("tokenHash");
    });

    it("stops verifying a revoked token", async () => {
        const { token, apiToken } = await createPersonalToken(userId, "Game", "write");
        expect(await revokePersonalToken(userId, apiToken.id)).toBe(true);
        expect(await verifyPersonalToken(token)).toBeNull();
        expect(await revokePersonalToken(userId, apiToken.id)).toBe(false);
    });

    it("does not let one user revoke another's token", async () => {
        const { token, apiToken } = await createPersonalToken(userId, "Game", "write");
        expect(await revokePersonalToken("someone-else", apiToken.id)).toBe(false);
        expect(await verifyPersonalToken(token)).not.toBeNull();
    });

    it("rejects unknown, unprefixed and tampered tokens", async () => {
        const { token } = await createPersonalToken(userId, "Game", "write");
        expect(await verifyPersonalToken(`${PERSONAL_TOKEN_PREFIX}unknown`)).toBeNull();
        expect(await verifyPersonalToken(token.slice(PERSONAL_TOKEN_PREFIX.length))).toBeNull();
        expect(await verifyPersonalToken(`${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`)).toBeNull();
    });

    it("rejects a token whose account ALLOWED_EMAILS no longer lists", async () => {
        const { token } = await createPersonalToken(userId, "Game", "write");
        vi.stubEnv("ALLOWED_EMAILS", "someone@else.com");
        expect(await verifyPersonalToken(token)).toBeNull();
    });

    it("stops verifying once the account is deleted", async () => {
        const { token } = await createPersonalToken(userId, "Game", "write");
        await prisma.user.delete({ where: { id: userId } });
        expect(await verifyPersonalToken(token)).toBeNull();
    });

    it("records last use at most once a minute", async () => {
        const { token, apiToken } = await createPersonalToken(userId, "Game", "read");
        expect(apiToken.lastUsedAt).toBeNull();

        await verifyPersonalToken(token);
        const first = (await prisma.apiToken.findUniqueOrThrow({ where: { id: apiToken.id } })).lastUsedAt;
        expect(first).toBeInstanceOf(Date);

        await verifyPersonalToken(token);
        const second = (await prisma.apiToken.findUniqueOrThrow({ where: { id: apiToken.id } })).lastUsedAt;
        expect(second).toEqual(first);

        const stale = new Date(Date.now() - 2 * 60_000);
        await prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: stale } });
        await verifyPersonalToken(token);
        const third = (await prisma.apiToken.findUniqueOrThrow({ where: { id: apiToken.id } })).lastUsedAt;
        expect(third!.getTime()).toBeGreaterThan(stale.getTime());
    });

    describe("isPersonalTokenRequestAllowed", () => {
        it.each([
            ["/api/nodes/x/content", "GET", "read", "ok"],
            ["/api/nodes/x/content", "HEAD", "read", "ok"],
            ["/api/nodes/x/content", "PUT", "read", "read-only"],
            ["/api/nodes/x/content", "PUT", "write", "ok"],
            ["/api/nodes", "POST", "read", "read-only"],
            ["/api/nodes/move", "POST", "write", "ok"],
            ["/api/mcp", "POST", "read", "ok"],
            ["/api/account/api-tokens", "POST", "write", "out-of-scope"],
            ["/api/projects", "GET", "write", "out-of-scope"],
            ["/api/nodes-evil", "GET", "write", "out-of-scope"],
            ["/api/mcpx", "POST", "write", "out-of-scope"],
        ] as const)("%s %s with %s → %s", (path, method, scope, expected) => {
            expect(isPersonalTokenRequestAllowed(path, method, scope)).toBe(expected);
        });
    });
});
