import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { testPrisma } from "./setup";

// Must import after setup sets DATABASE_URL
import {
  registerClient,
  getClient,
  createAuthCode,
  consumeAuthCode,
  authCodes,
  type ClientRegistration,
} from "@/lib/oauth-store";

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

  describe("auth codes (in-memory)", () => {
    beforeEach(() => {
      authCodes.clear();
    });

    afterEach(() => {
      authCodes.clear();
    });

    it("creates and consumes an auth code", () => {
      const code = createAuthCode({
        userId: "user-1",
        email: "test@example.com",
        codeChallenge: "challenge123",
        codeChallengeMethod: "S256",
        redirectUri: "http://localhost:3000/callback",
        clientId: "client-1",
      });

      expect(code.code).toBeTruthy();
      expect(code.userId).toBe("user-1");
      expect(code.expiresAt).toBeGreaterThan(Date.now());

      const consumed = consumeAuthCode(code.code);
      expect(consumed).not.toBeNull();
      expect(consumed!.userId).toBe("user-1");
      expect(consumed!.email).toBe("test@example.com");
    });

    it("auth code is single-use (second consumption returns null)", () => {
      const code = createAuthCode({
        userId: "user-1",
        email: "test@example.com",
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        redirectUri: "http://localhost/cb",
        clientId: "client-1",
      });

      const first = consumeAuthCode(code.code);
      expect(first).not.toBeNull();

      const second = consumeAuthCode(code.code);
      expect(second).toBeNull();
    });

    it("returns null for nonexistent auth code", () => {
      const result = consumeAuthCode("nonexistent-code");
      expect(result).toBeNull();
    });

    it("returns null for expired auth code", () => {
      const code = createAuthCode({
        userId: "user-1",
        email: "test@example.com",
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        redirectUri: "http://localhost/cb",
        clientId: "client-1",
      });

      // Manually expire the code
      const entry = authCodes.get(code.code)!;
      entry.expiresAt = Date.now() - 1000;

      const result = consumeAuthCode(code.code);
      expect(result).toBeNull();
    });

    it("each auth code gets a unique code string", () => {
      const params = {
        userId: "user-1",
        email: "test@example.com",
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        redirectUri: "http://localhost/cb",
        clientId: "client-1",
      };

      const code1 = createAuthCode(params);
      const code2 = createAuthCode(params);
      expect(code1.code).not.toBe(code2.code);
    });
  });
});
