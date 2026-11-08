import { config } from "zod";
import { describe, expect, it } from "vitest";

describe("instrumentation-client", () => {
  it("puts zod in jitless mode so it never probes eval under the CSP", async () => {
    await import("@/instrumentation-client");
    expect(config().jitless).toBe(true);
  });
});
