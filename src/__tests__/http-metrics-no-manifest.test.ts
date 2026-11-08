/**
 * startHttpMetrics without a routes manifest, as under `next dev`. A separate
 * file from http-metrics.test.ts because diagnostics_channel subscriptions are
 * process-wide: a second startHttpMetrics there would double-count its requests.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { startHttpMetrics } from "@/lib/http-metrics";
import { httpRequestCounter } from "@/lib/metrics";

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  startHttpMetrics(path.join(os.tmpdir(), "http-metrics-missing", "routes-manifest.json"));
  server = http.createServer((_req, res) => res.end("ok"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("HTTP request metrics without a routes manifest", () => {
  it("still serves and counts the request, labelled other", async () => {
    const res = await fetch(baseUrl + "/api/health");
    expect(await res.text()).toBe("ok");
    // response.finish can fire just after the client has the body.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const { values } = await httpRequestCounter.get();
    expect(values).toContainEqual({ labels: { method: "GET", path: "other", status: "200" }, value: 1 });
  });
});
