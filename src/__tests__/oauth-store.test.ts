import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "./setup";

// Must import after setup sets DATABASE_URL
import {
  registerClient,
  getClient,
  createAuthCode,
  findAuthCode,
  consumeAuthCode,
  type ClientRegistration,
} from "@/lib/oauth-store";
import { prisma } from "@/lib/db";

describe("OAuth Store", () => {
  describe("client registration (database-persisted)", () => {
    const sampleClient: ClientRegistration = {
      client_id: "test-client-001",
      client_name: "Test App",
      redirect_uris: ["http://localhost:3000/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      registered_at: Date.now(),
    };

    it("registers and retrieves a client", async () => {
      await registerClient(sampleClient);
      const retrieved = await getClient("test-client-001");

      expect(retrieved).not.toBeNull();
      expect(retrieved!.client_id).toBe("test-client-001");
      expect(retrieved!.client_name).toBe("Test App");
      expect(retrieved!.redirect_uris).toEqual(["http://localhost:3000/callback"]);
      expect(retrieved!.grant_types).toEqual(["authorization_code", "refresh_token"]);
      expect(retrieved!.registered_at).toBeTypeOf("number");
    });

    it("returns null for non-existent client", async () => {
      const result = await getClient("nonexistent-client");
      expect(result).toBeNull();
    });

    it("handles multiple redirect URIs", async () => {
      const multiRedirectClient: ClientRegistration = {
        client_id: "multi-redirect-client",
        client_name: "Multi Redirect App",
        redirect_uris: [
          "http://localhost:3000/callback",
          "http://localhost:4000/callback",
          "https://example.com/oauth/callback",
        ],
        grant_types: ["authorization_code"],
        registered_at: Date.now(),
      };

      await registerClient(multiRedirectClient);
      const retrieved = await getClient("multi-redirect-client");

      expect(retrieved!.redirect_uris).toHaveLength(3);
      expect(retrieved!.redirect_uris).toContain("https://example.com/oauth/callback");
    });
  });

  describe("auth codes (database-persisted)", () => {
    beforeEach(async () => {
      await prisma.oAuthAuthCode.deleteMany();
    });

    afterEach(async () => {
      await prisma.oAuthAuthCode.deleteMany();
    });

    const codeParams = {
      userId: "user-1",
      email: "test@example.com",
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      redirectUri: "http://localhost/cb",
      clientId: "client-1",
    };

    async function expire(code: string) {
      await prisma.oAuthAuthCode.update({
        where: { code },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
    }

    it("creates and finds an auth code without consuming it", async () => {
      const code = await createAuthCode(codeParams);

      expect(code.code).toBeTruthy();
      expect(code.userId).toBe("user-1");
      expect(code.expiresAt).toBeGreaterThan(Date.now());

      const found = await findAuthCode(code.code);
      expect(found).not.toBeNull();
      expect(found!.userId).toBe("user-1");
      expect(found!.email).toBe("test@example.com");
      expect(await findAuthCode(code.code)).not.toBeNull();
    });

    it("auth code is single-use (second consumption returns false)", async () => {
      const code = await createAuthCode(codeParams);

      expect(await consumeAuthCode(code.code)).toBe(true);
      expect(await consumeAuthCode(code.code)).toBe(false);
      expect(await findAuthCode(code.code)).toBeNull();
    });

    it("concurrent consumptions cannot both succeed", async () => {
      const code = await createAuthCode(codeParams);

      const results = await Promise.all(Array.from({ length: 5 }, () => consumeAuthCode(code.code)));
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it("returns null / false for nonexistent auth code", async () => {
      expect(await findAuthCode("nonexistent-code")).toBeNull();
      expect(await consumeAuthCode("nonexistent-code")).toBe(false);
    });

    it("does not consume an expired auth code", async () => {
      const code = await createAuthCode(codeParams);
      await expire(code.code);

      expect(await consumeAuthCode(code.code)).toBe(false);
    });

    it("deletes an expired auth code on lookup", async () => {
      const code = await createAuthCode(codeParams);
      await expire(code.code);

      expect(await findAuthCode(code.code)).toBeNull();
      const row = await prisma.oAuthAuthCode.findUnique({ where: { code: code.code } });
      expect(row).toBeNull();
    });

    it("each auth code gets a unique code string", async () => {
      const code1 = await createAuthCode(codeParams);
      const code2 = await createAuthCode(codeParams);
      expect(code1.code).not.toBe(code2.code);
    });
  });
});
