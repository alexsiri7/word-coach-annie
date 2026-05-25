import { Registry, Counter, Histogram, Gauge } from "prom-client";

interface MetricsState {
  registry: Registry;
  httpRequestCounter: Counter<string>;
  httpRequestDuration: Histogram<string>;
  projectsGauge: Gauge<string>;
  usersGauge: Gauge<string>;
}

/**
 * Guard against hot-module replacement in development re-registering metrics.
 * prom-client throws if you register a metric name twice in the same registry.
 * Caching on globalThis survives HMR restarts; in production each invocation
 * gets a fresh module context so this is a no-op there.
 */
const globalForMetrics = globalThis as unknown as {
  metricsState: MetricsState | undefined;
};

function createMetrics(): MetricsState {
  const registry = new Registry();

  // TODO(#239-followup): increment these in Next.js middleware once
  // middleware instrumentation is in scope. Exported here so the registry
  // is consistent when they are wired up.
  const httpRequestCounter = new Counter({
    name: "annie_http_requests_total",
    help: "Total HTTP requests by method, path, and status",
    labelNames: ["method", "path", "status"],
    registers: [registry],
  });

  const httpRequestDuration = new Histogram({
    name: "annie_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "path"],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  const projectsGauge = new Gauge({
    name: "annie_projects_total",
    help: "Total projects in the database",
    registers: [registry],
  });

  const usersGauge = new Gauge({
    name: "annie_users_total",
    help: "Total users in the database",
    registers: [registry],
  });

  return { registry, httpRequestCounter, httpRequestDuration, projectsGauge, usersGauge };
}

const metricsState = globalForMetrics.metricsState ?? createMetrics();

if (process.env.NODE_ENV !== "production") {
  globalForMetrics.metricsState = metricsState;
}

export const { registry, httpRequestCounter, httpRequestDuration, projectsGauge, usersGauge } = metricsState;
