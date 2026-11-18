/**
 * OpenTelemetry + Phoenix configuration.
 *
 * Initializes the OTEL NodeSDK with an OTLP exporter pointing at
 * a Phoenix collector. Call `initTelemetry()` once at process startup
 * (via Next.js instrumentation hook).
 *
 * Env vars:
 *   PHOENIX_COLLECTOR_ENDPOINT - OTLP endpoint (default: http://localhost:6006/v1/traces)
 *   OTEL_ENABLED              - Set to "true" to enable (default: disabled)
 *
 * Spans never carry manuscript content (the privacy policy promises this), so
 * ADK's default of copying LLM requests/responses and tool args into its spans
 * is switched off.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { trace, type Tracer } from "@opentelemetry/api";

let sdk: NodeSDK | null = null;

export function initTelemetry() {
  // @google/adk attaches full prompts, responses and tool args to its own spans
  // unless this is "false"; the privacy policy promises traces carry no manuscript text.
  process.env.ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS = "false";

  const enabled = process.env.OTEL_ENABLED === "true";
  if (!enabled) return;

  const endpoint =
    process.env.PHOENIX_COLLECTOR_ENDPOINT || "http://localhost:6006/v1/traces";

  const exporter = new OTLPTraceExporter({ url: endpoint });

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "word-coach-annie",
      [ATTR_SERVICE_VERSION]: process.env.NEXT_PUBLIC_BUILD_VERSION || "dev",
    }),
    traceExporter: exporter,
  });

  sdk.start();
}

/** Get a tracer for the given instrumentation scope. */
export function getTracer(name = "word-coach-annie"): Tracer {
  return trace.getTracer(name);
}

export async function shutdownTelemetry() {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}
