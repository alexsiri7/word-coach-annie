import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const jsdomEntry = require.resolve("jsdom");

// isomorphic-dompurify is deliberately not mocked: it loads through Node's real loader, and its
// jsdom dependency is the require(esm) graph #1625 is about.
const jsdomLoadedWhenSentryConfigStarted: boolean[] = [];

vi.mock("@sentry/nextjs", () => ({ captureRequestError: vi.fn() }));
vi.mock("../../sentry.server.config", () => {
  jsdomLoadedWhenSentryConfigStarted.push(require.cache[jsdomEntry]?.loaded === true);
  return {};
});
vi.mock("@/lib/telemetry", () => ({ initTelemetry: vi.fn() }));
vi.mock("@/lib/http-metrics", () => ({ startHttpMetrics: vi.fn() }));
vi.mock("@/lib/expired-auth-cleanup", () => ({ startExpiredAuthCleanup: vi.fn() }));

describe("instrumentation register()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // #1625: the jsdom -> @exodus/bytes require(esm) graph must finish loading before anything
  // else loads, or Node can throw ERR_INTERNAL_ASSERTION. Starting the next import before
  // isomorphic-dompurify settles (no await, Promise.all) fails this.
  it("finishes loading isomorphic-dompurify before the next import starts", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    expect(require.cache[jsdomEntry]).toBeUndefined();

    const { register } = await import("@/instrumentation");
    await register();

    expect(jsdomLoadedWhenSentryConfigStarted).toEqual([true]);
  });
});
