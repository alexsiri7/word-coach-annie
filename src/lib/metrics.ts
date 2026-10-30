import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from "prom-client";

interface MetricsState {
  registry: Registry;
  httpRequestCounter: Counter<string>;
  httpRequestDuration: Histogram<string>;
  projectsGauge: Gauge<string>;
  usersGauge: Gauge<string>;
}

/**
 * Next compiles instrumentation and route handlers into separate server
 * bundles, each evaluating its own copy of this module. The registry lives on
 * globalThis so request counters incremented from instrumentation show up in
 * /api/metrics. It also stops HMR from re-registering metric names in dev,
 * which prom-client rejects.
 */
const globalForMetrics = globalThis as unknown as {
  metricsState: MetricsState | undefined;
};

function createMetrics(): MetricsState {
  const registry = new Registry();

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

  // Enable Node.js default metrics (heap, RSS, GC stats, event loop lag, etc.)
  collectDefaultMetrics({ register: registry });

  return { registry, httpRequestCounter, httpRequestDuration, projectsGauge, usersGauge };
}

const metricsState = (globalForMetrics.metricsState ??= createMetrics());

export const { registry, httpRequestCounter, httpRequestDuration, projectsGauge, usersGauge } = metricsState;
