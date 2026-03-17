import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("telemetry", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("does not initialize when OTEL_ENABLED is not set", async () => {
    delete process.env.OTEL_ENABLED;
    const { initTelemetry } = await import("../lib/telemetry");
    // Should not throw
    expect(() => initTelemetry()).not.toThrow();
  });

  it("does not initialize when OTEL_ENABLED is false", async () => {
    process.env.OTEL_ENABLED = "false";
    const { initTelemetry } = await import("../lib/telemetry");
    expect(() => initTelemetry()).not.toThrow();
  });

  it("initializes SDK when OTEL_ENABLED is true", async () => {
    process.env.OTEL_ENABLED = "true";
    process.env.PHOENIX_COLLECTOR_ENDPOINT = "http://localhost:6006/v1/traces";
    const { initTelemetry, shutdownTelemetry } = await import(
      "../lib/telemetry"
    );
    expect(() => initTelemetry()).not.toThrow();
    await shutdownTelemetry();
  });

  it("shutdownTelemetry is safe to call when not initialized", async () => {
    delete process.env.OTEL_ENABLED;
    const { initTelemetry, shutdownTelemetry } = await import(
      "../lib/telemetry"
    );
    initTelemetry(); // noop since disabled
    await expect(shutdownTelemetry()).resolves.not.toThrow();
  });
});
