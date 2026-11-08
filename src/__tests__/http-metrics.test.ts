/**
 * Integration test for src/lib/http-metrics.ts against the real
 * @/lib/metrics registry (metrics-route.test.ts mocks it wholesale).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startHttpMetrics } from "@/lib/http-metrics";
import { httpRequestCounter, httpRequestDuration } from "@/lib/metrics";

let server: http.Server;
let baseUrl: string;
let tmpDir: string;

async function get(pathname: string): Promise<void> {
  const res = await fetch(baseUrl + pathname);
  await res.text();
  // response.finish can fire just after the client has the body.
  await new Promise((resolve) => setTimeout(resolve, 20));
}

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), "http-metrics-"));
  const manifestPath = path.join(tmpDir, "routes-manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      staticRoutes: [{ page: "/api/health", regex: "^/api/health(?:/)?$" }],
      dynamicRoutes: [{ page: "/api/projects/[id]", regex: "^/api/projects/([^/]+?)(?:/)?$" }],
    }),
  );
  startHttpMetrics(manifestPath);

  server = http.createServer((req, res) => {
    res.statusCode = req.url?.startsWith("/api/projects/") ? 200 : 404;
    res.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  httpRequestCounter.reset();
  httpRequestDuration.reset();
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("HTTP request metrics", () => {
  it("counts requests by route template and final status", async () => {
    await get("/api/projects/abc?x=1");
    await get("/wp-login.php");

    const { values } = await httpRequestCounter.get();
    expect(values).toEqual(
      expect.arrayContaining([
        { labels: { method: "GET", path: "/api/projects/[id]", status: "200" }, value: 1 },
        { labels: { method: "GET", path: "other", status: "404" }, value: 1 },
      ]),
    );
  });

  it("records duration per route", async () => {
    await get("/api/projects/abc");

    const { values } = await httpRequestDuration.get();
    const count = values.find(
      (v) => v.metricName === "annie_http_request_duration_seconds_count" && v.labels.path === "/api/projects/[id]",
    );
    expect(count?.value).toBe(1);
  });
});
