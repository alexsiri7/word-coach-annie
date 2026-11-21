import { afterEach, describe, expect, it, vi } from "vitest";

const loaded: string[] = [];

vi.mock("@sentry/nextjs", () => ({ captureRequestError: vi.fn() }));
vi.mock("isomorphic-dompurify", () => {
  loaded.push("isomorphic-dompurify");
  return { default: {} };
});
vi.mock("../../sentry.server.config", () => {
  loaded.push("sentry.server.config");
  return {};
});
vi.mock("@/lib/telemetry", () => ({ initTelemetry: vi.fn() }));
vi.mock("@/lib/http-metrics", () => ({ startHttpMetrics: vi.fn() }));
vi.mock("@/lib/expired-auth-cleanup", () => ({ startExpiredAuthCleanup: vi.fn() }));

describe("instrumentation register()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // #1625: the jsdom -> @exodus/bytes require(esm) graph must be fully loaded before Next
  // starts loading routes concurrently, or Node can throw ERR_INTERNAL_ASSERTION.
  it("loads isomorphic-dompurify first in the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const { register } = await import("@/instrumentation");
    await register();
    expect(loaded[0]).toBe("isomorphic-dompurify");
  });
});
