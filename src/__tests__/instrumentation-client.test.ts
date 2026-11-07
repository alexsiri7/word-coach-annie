import { describe, expect, it } from "vitest";
import { z } from "zod";
import "@/instrumentation-client";

describe("instrumentation-client", () => {
  it("disables zod's eval probe so the CSP never reports it", () => {
    expect(z.config().jitless).toBe(true);
  });
});
