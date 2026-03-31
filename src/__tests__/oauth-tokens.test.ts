import { describe, it, expect, beforeEach, afterEach } from "vitest";

// JWT_SECRET must be set before importing the module
const origJwt = process.env.JWT_SECRET;
process.env.JWT_SECRET = "test-jwt-secret-for-oauth-tokens";

import {
  createMcpToken,
  verifyMcpToken,
  verifyPkce,
  base64urlEncode,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
} from "@/lib/oauth-tokens";

describe("MCP OAuth Tokens", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-jwt-secret-for-oauth-tokens";
  });

  afterEach(() => {
    if (origJwt !== undefined) process.env.JWT_SECRET = origJwt;
    else delete process.env.JWT_SECRET;
  });

  describe("token TTL constants", () => {
    it("access token TTL is 1 hour", () => {
      expect(ACCESS_TOKEN_TTL).toBe(3600);
    });

    it("refresh token TTL is 30 days", () => {
      expect(REFRESH_TOKEN_TTL).toBe(60 * 60 * 24 * 30);
    });
  });

  describe("createMcpToken + verifyMcpToken round-trip", () => {
    it("creates and verifies an access token", async () => {
      const token = await createMcpToken(
        { userId: "user-123", email: "test@example.com", type: "mcp_access" },
        ACCESS_TOKEN_TTL
      );

      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");

      const payload = await verifyMcpToken(token, "mcp_access");
      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe("user-123");
      expect(payload!.email).toBe("test@example.com");
    });

    it("creates and verifies a refresh token", async () => {
      const token = await createMcpToken(
        { userId: "user-456", email: "refresh@example.com", type: "mcp_refresh" },
        REFRESH_TOKEN_TTL
      );

      const payload = await verifyMcpToken(token, "mcp_refresh");
      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe("user-456");
      expect(payload!.email).toBe("refresh@example.com");
    });

    it("rejects token with wrong expected type", async () => {
      const token = await createMcpToken(
        { userId: "user-123", email: "test@example.com", type: "mcp_access" },
        ACCESS_TOKEN_TTL
      );

      // Verify as refresh should fail
      const payload = await verifyMcpToken(token, "mcp_refresh");
      expect(payload).toBeNull();
    });

    it("rejects invalid/garbage token", async () => {
      const payload = await verifyMcpToken("not.a.valid.token", "mcp_access");
      expect(payload).toBeNull();
    });

    it("rejects expired token", async () => {
      // Create a token that expires in 1 second
      const token = await createMcpToken(
        { userId: "user-123", email: "test@example.com", type: "mcp_access" },
        0 // 0 seconds TTL — already expired
      );

      // Small delay to ensure it's past expiry
      await new Promise((r) => setTimeout(r, 100));

      const payload = await verifyMcpToken(token, "mcp_access");
      expect(payload).toBeNull();
    });
  });

  describe("base64urlEncode", () => {
    it("encodes buffer to base64url (no padding)", () => {
      const buffer = new TextEncoder().encode("hello").buffer;
      const encoded = base64urlEncode(buffer);

      expect(encoded).toBeTruthy();
      // base64url should not contain +, /, or =
      expect(encoded).not.toMatch(/[+/=]/);
    });

    it("encodes empty buffer", () => {
      const buffer = new ArrayBuffer(0);
      const encoded = base64urlEncode(buffer);
      expect(encoded).toBe("");
    });
  });

  describe("verifyPkce", () => {
    it("verifies a valid PKCE code_verifier against code_challenge", async () => {
      // Generate a challenge from a known verifier
      const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier)
      );
      const challenge = base64urlEncode(digest);

      const result = await verifyPkce(verifier, challenge);
      expect(result).toBe(true);
    });

    it("rejects mismatched verifier/challenge", async () => {
      const result = await verifyPkce("wrong-verifier", "wrong-challenge");
      expect(result).toBe(false);
    });

    it("rejects empty verifier against real challenge", async () => {
      const verifier = "real-verifier";
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier)
      );
      const challenge = base64urlEncode(digest);

      const result = await verifyPkce("", challenge);
      expect(result).toBe(false);
    });
  });
});
