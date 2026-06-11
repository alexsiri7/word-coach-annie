import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SignJWT } from "jose";

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
import { getJwtKey } from "@/lib/auth";

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
        { userId: "user-123", email: "test@example.com", type: "mcp_access", clientId: "client-1" },
        ACCESS_TOKEN_TTL
      );

      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");

      const payload = await verifyMcpToken(token, "mcp_access");
      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe("user-123");
      expect(payload!.email).toBe("test@example.com");
      expect(payload!.clientId).toBe("client-1");
    });

    it("creates and verifies a refresh token with clientId binding", async () => {
      const token = await createMcpToken(
        { userId: "user-456", email: "refresh@example.com", type: "mcp_refresh", clientId: "client-1" },
        REFRESH_TOKEN_TTL
      );

      const payload = await verifyMcpToken(token, "mcp_refresh");
      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe("user-456");
      expect(payload!.email).toBe("refresh@example.com");
      expect(payload!.clientId).toBe("client-1");
    });

    it("includes jti in verified token payload", async () => {
      const token = await createMcpToken(
        { userId: "user-123", email: "test@example.com", type: "mcp_refresh", clientId: "client-1" },
        REFRESH_TOKEN_TTL
      );
      const payload = await verifyMcpToken(token, "mcp_refresh");
      expect(payload).not.toBeNull();
      expect(payload!.jti).toBeDefined();
      expect(typeof payload!.jti).toBe("string");
      expect(payload!.exp).toBeDefined();
      expect(payload!.exp).toBeGreaterThan(Date.now() / 1000);
    });

    it("rejects token with wrong expected type", async () => {
      const token = await createMcpToken(
        { userId: "user-123", email: "test@example.com", type: "mcp_access", clientId: "client-1" },
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

    it("rejects a valid HS256 token without issuer/audience claims", async () => {
      const key = await getJwtKey();
      const token = await new SignJWT({
        userId: "user-1", email: "a@b.com",
        type: "mcp_access", clientId: "client-1",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(key);
      const payload = await verifyMcpToken(token, "mcp_access");
      expect(payload).toBeNull();
    });

    it("rejects an access token presented as a refresh token audience", async () => {
      const token = await createMcpToken(
        { userId: "user-1", email: "a@b.com", type: "mcp_access", clientId: "c1" },
        ACCESS_TOKEN_TTL
      );
      const payload = await verifyMcpToken(token, "mcp_refresh");
      expect(payload).toBeNull();
    });

    it("rejects a session token presented to MCP verifier", async () => {
      const { createSessionToken } = await import("@/lib/auth");
      const sessionToken = await createSessionToken({
        userId: "user-1", email: "a@b.com", name: "A",
      });
      const payload = await verifyMcpToken(sessionToken, "mcp_access");
      expect(payload).toBeNull();
    });

    it("rejects a token missing clientId claim (legacy token)", async () => {
      // Simulate a pre-fix token by signing directly without clientId.
      // Tokens issued before this PR will be rejected, enforcing the security fix.
      const key = await getJwtKey();
      const legacyToken = await new SignJWT({
        userId: "user-legacy",
        email: "legacy@example.com",
        type: "mcp_access",
        // no clientId field — simulates a token issued before MED-03 fix
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(key);

      const payload = await verifyMcpToken(legacyToken, "mcp_access");
      expect(payload).toBeNull(); // legacy tokens must not be accepted
    });

    it("rejects expired token", async () => {
      vi.useFakeTimers();
      try {
        // Create a token with a 1-second TTL
        const token = await createMcpToken(
          { userId: "user-123", email: "test@example.com", type: "mcp_access", clientId: "client-1" },
          1 // 1 second TTL
        );

        // Advance time past expiry
        vi.advanceTimersByTime(2000);

        const payload = await verifyMcpToken(token, "mcp_access");
        expect(payload).toBeNull();
      } finally {
        vi.useRealTimers();
      }
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

    it("rejects a challenge that differs by one character but has same length", async () => {
      const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier)
      );
      const challenge = base64urlEncode(digest);
      // Tamper last character while preserving length
      const tampered =
        challenge.slice(0, -1) + (challenge.endsWith("A") ? "B" : "A");
      expect(tampered.length).toBe(challenge.length);

      const result = await verifyPkce(verifier, tampered);
      expect(result).toBe(false);
    });
  });
});
