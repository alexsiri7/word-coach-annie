import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // jsdom (under isomorphic-dompurify) require()s the ESM-only @exodus/bytes. Node's
    // require(esm) throws ERR_INTERNAL_ASSERTION if that races an import() of the same graph,
    // which concurrent route loading can do, so load it once here: Next finishes register()
    // before it loads any route (#1625).
    await import("isomorphic-dompurify");

    await import("../sentry.server.config");

    // Initialize OpenTelemetry + Phoenix tracing (gated by OTEL_ENABLED)
    const { initTelemetry } = await import("./lib/telemetry");
    initTelemetry();

    const { startHttpMetrics } = await import("./lib/http-metrics");
    startHttpMetrics();

    const { startExpiredAuthCleanup } = await import("./lib/expired-auth-cleanup");
    startExpiredAuthCleanup();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
