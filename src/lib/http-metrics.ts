/**
 * Populates the HTTP request metrics from Node's built-in http
 * diagnostics_channel events. The proxy cannot do this: for passed-through
 * requests it only returns NextResponse.next(), so it never sees the final
 * status or the total duration.
 *
 * The `path` label is the Next route template from routes-manifest.json (or
 * "other"), never the raw URL, to keep label cardinality bounded.
 */
import { subscribe } from "node:diagnostics_channel";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { httpRequestCounter, httpRequestDuration } from "@/lib/metrics";
import { logger } from "@/lib/logger";

interface ServerMessage {
  request: IncomingMessage;
  response: ServerResponse;
}

interface ManifestRoute {
  page: string;
  regex: string;
}

interface Route {
  page: string;
  pattern: RegExp;
}

function loadRoutes(manifestPath: string): Route[] {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      staticRoutes?: ManifestRoute[];
      dynamicRoutes?: ManifestRoute[];
    };
    return [...(manifest.staticRoutes ?? []), ...(manifest.dynamicRoutes ?? [])].map((r) => ({
      page: r.page,
      pattern: new RegExp(r.regex),
    }));
  } catch (error) {
    logger.warn(`HTTP metrics: cannot read ${manifestPath}; labelling every path "other"`, error);
    return [];
  }
}

export function startHttpMetrics(
  manifestPath = path.join(process.cwd(), ".next", "routes-manifest.json"),
): void {
  let routes: Route[] | undefined;
  const routeLabel = (url: string | undefined): string => {
    routes ??= loadRoutes(manifestPath);
    const pathname = (url ?? "/").split("?")[0];
    return routes.find((r) => r.pattern.test(pathname))?.page ?? "other";
  };

  const starts = new WeakMap<IncomingMessage, bigint>();

  subscribe("http.server.request.start", (message) => {
    starts.set((message as ServerMessage).request, process.hrtime.bigint());
  });

  subscribe("http.server.response.finish", (message) => {
    const { request, response } = message as ServerMessage;
    const method = request.method ?? "UNKNOWN";
    const label = routeLabel(request.url);
    httpRequestCounter.inc({ method, path: label, status: String(response.statusCode) });
    const start = starts.get(request);
    if (start !== undefined) {
      httpRequestDuration.observe(
        { method, path: label },
        Number(process.hrtime.bigint() - start) / 1e9,
      );
    }
  });
}
