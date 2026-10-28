import { describe, it, expect, vi } from "vitest";

const writeFileSync = vi.hoisted(() => vi.fn());
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, default: { ...actual, writeFileSync }, writeFileSync };
});

describe("public/version.json written by next.config", () => {
  it("carries only an opaque build id, not the commit SHA (SEC-38)", async () => {
    vi.stubEnv("COMMIT_SHA", "deadbeefcafe");
    await import("../../next.config");

    const call = writeFileSync.mock.calls.find(([path]) => String(path).endsWith("version.json"));
    expect(call).toBeDefined();
    const raw = String(call![1]);
    expect(Object.keys(JSON.parse(raw))).toEqual(["version"]);
    expect(JSON.parse(raw).version).toMatch(/^[0-9a-f-]{36}$/);
    expect(raw).not.toContain("deadbee");
  });
});
