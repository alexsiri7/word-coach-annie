/**
 * Integration tests for src/lib/metrics.ts — imports the real module (no mock)
 * to verify that collectDefaultMetrics is registered to the local registry.
 *
 * Note: metrics-route.test.ts mocks @/lib/metrics wholesale; this file must
 * not be merged with that test file or the mock would shadow the real module.
 */
import { describe, it, expect } from "vitest";
import { registry } from "@/lib/metrics";

describe("metrics registry (integration)", () => {
    it("default Node.js metrics are registered in the local registry", async () => {
        const output = await registry.metrics();
        // prom-client collectDefaultMetrics registers nodejs_heap_size_used_bytes
        // (and related heap/RSS metrics). Verify at least one is present.
        expect(output).toMatch(/nodejs_heap_size_used_bytes|process_heap_bytes/);
    });

    it("custom annie metrics are present in the registry", async () => {
        const output = await registry.metrics();
        expect(output).toContain("annie_projects_total");
        expect(output).toContain("annie_users_total");
    });
});
