import { describe, it, expect, vi } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, default: { ...actual, writeFileSync: vi.fn() }, writeFileSync: vi.fn() };
});

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

async function loadConfig() {
  const { default: config } = await import("../../next.config");
  const rules = (await config.headers!()) as HeaderRule[];
  return { config, rules };
}

function headersFor(rules: HeaderRule[], pathname: string): Record<string, string> {
  const applied: Record<string, string> = {};
  for (const rule of rules) {
    if (!getPathMatch(rule.source, { strict: true })(pathname)) continue;
    for (const { key, value } of rule.headers) applied[key] = value;
  }
  return applied;
}

describe("next.config security headers (SEC-43)", () => {
  it("does not advertise X-Powered-By", async () => {
    const { config } = await loadConfig();
    expect(config.poweredByHeader).toBe(false);
  });

  it("isolates app pages with COOP and CORP same-origin", async () => {
    const { rules } = await loadConfig();
    for (const path of ["/", "/projects/abc", "/api/projects", "/landing"]) {
      const headers = headersFor(rules, path);
      expect(headers["Cross-Origin-Opener-Policy"], path).toBe("same-origin");
      expect(headers["Cross-Origin-Resource-Policy"], path).toBe("same-origin");
      expect(headers["X-Frame-Options"], path).toBe("DENY");
    }
  });

  it("keeps COOP off the OAuth consent flow so a client's popup keeps its opener", async () => {
    const { rules } = await loadConfig();
    for (const path of ["/oauth/authorize", "/login"]) {
      const headers = headersFor(rules, path);
      expect(headers["Cross-Origin-Opener-Policy"], path).toBeUndefined();
      expect(headers["Cross-Origin-Resource-Policy"], path).toBe("same-origin");
    }
  });
});
