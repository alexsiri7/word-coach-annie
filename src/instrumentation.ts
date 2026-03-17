import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    // Initialize OpenTelemetry + Phoenix tracing (gated by OTEL_ENABLED)
    const { initTelemetry } = await import("./lib/telemetry");
    initTelemetry();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
