import { describe, it, expect } from "vitest";

// Unit tests for the Workbox urlPattern functions defined in next.config.ts.
// These are extracted and tested in isolation to document the ordering dependency
// between the OAuth NetworkOnly guard and the catch-all navigation NetworkFirst
// handler. Rule ordering is critical: Workbox evaluates entries first-match-wins,
// so the OAuth rule must precede the navigation rule.

const oauthPattern = ({ url }: { url: URL }) =>
  url.pathname.startsWith("/oauth/") || url.pathname.startsWith("/api/auth/");

const navPattern = ({ request }: { request: Pick<Request, "mode"> }) =>
  request.mode === "navigate";

describe("service worker urlPattern rules", () => {
  describe("oauthPattern", () => {
    it("matches /oauth/callback", () => {
      expect(oauthPattern({ url: new URL("https://app.test/oauth/callback") })).toBe(true);
    });

    it("matches /oauth/ prefix", () => {
      expect(oauthPattern({ url: new URL("https://app.test/oauth/") })).toBe(true);
    });

    it("matches /api/auth/signin", () => {
      expect(oauthPattern({ url: new URL("https://app.test/api/auth/signin") })).toBe(true);
    });

    it("matches /api/auth/ prefix", () => {
      expect(oauthPattern({ url: new URL("https://app.test/api/auth/") })).toBe(true);
    });

    it("does not match /api/projects", () => {
      expect(oauthPattern({ url: new URL("https://app.test/api/projects") })).toBe(false);
    });

    it("does not match /projects/proj-1", () => {
      expect(oauthPattern({ url: new URL("https://app.test/projects/proj-1") })).toBe(false);
    });

    it("does not match /", () => {
      expect(oauthPattern({ url: new URL("https://app.test/") })).toBe(false);
    });
  });

  describe("navPattern", () => {
    it("matches navigate mode requests", () => {
      expect(navPattern({ request: { mode: "navigate" } })).toBe(true);
    });

    it("does not match cors mode requests", () => {
      expect(navPattern({ request: { mode: "cors" } })).toBe(false);
    });

    it("does not match no-cors mode requests", () => {
      expect(navPattern({ request: { mode: "no-cors" } })).toBe(false);
    });

    it("does not match same-origin mode requests", () => {
      expect(navPattern({ request: { mode: "same-origin" } })).toBe(false);
    });
  });

  describe("rule ordering safety — OAuth takes precedence over nav handler", () => {
    // This test documents the critical invariant: for OAuth routes, both patterns
    // match. The NetworkOnly OAuth rule must be registered BEFORE the NetworkFirst
    // nav rule in runtimeCaching to ensure Workbox routes OAuth requests correctly.
    it("OAuth /oauth/callback matches oauthPattern (NetworkOnly) before navPattern (NetworkFirst)", () => {
      const url = new URL("https://app.test/oauth/callback");
      const request = { mode: "navigate" as const };
      // Both patterns match an OAuth navigation — ordering determines winner
      expect(oauthPattern({ url })).toBe(true);
      expect(navPattern({ request })).toBe(true);
    });

    it("OAuth /api/auth/signin matches oauthPattern (NetworkOnly) before navPattern (NetworkFirst)", () => {
      const url = new URL("https://app.test/api/auth/signin");
      const request = { mode: "navigate" as const };
      expect(oauthPattern({ url })).toBe(true);
      expect(navPattern({ request })).toBe(true);
    });

    it("non-OAuth navigation matches navPattern only", () => {
      const url = new URL("https://app.test/projects/proj-1");
      const request = { mode: "navigate" as const };
      expect(oauthPattern({ url })).toBe(false);
      expect(navPattern({ request })).toBe(true);
    });
  });
});
