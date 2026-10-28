import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/oauth-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/oauth-store")>()),
  registerClient: vi.fn(),
  countClientsByIpInWindow: vi.fn().mockResolvedValue(0),
  countTotalClients: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/db", () => ({
  prisma: { project: { findUnique: vi.fn().mockResolvedValue(null) } },
}));

vi.mock("@/lib/auth", () => ({ isAuthEnabled: vi.fn().mockReturnValue(false) }));
vi.mock("@/lib/api-auth", () => ({ getCurrentUserId: vi.fn().mockReturnValue(null) }));

import { isRateLimitBypassed, resetRateLimitStore, RATE_LIMITS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { POST as register } from "@/app/oauth/register/route";
import { POST as report } from "@/app/api/projects/[id]/report/route";

beforeEach(() => {
  resetRateLimitStore();
  vi.spyOn(logger, "warn").mockImplementation(() => {});
  vi.stubEnv("DISABLE_RATE_LIMIT", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isRateLimitBypassed", () => {
  it("is false in production even with DISABLE_RATE_LIMIT=true, and logs that the flag is ignored", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isRateLimitBypassed()).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("ignored in production"));
  });

  it("is true outside production with DISABLE_RATE_LIMIT=true", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(isRateLimitBypassed()).toBe(true);
  });

  it("is false when DISABLE_RATE_LIMIT is not set", () => {
    vi.stubEnv("DISABLE_RATE_LIMIT", "");
    vi.stubEnv("NODE_ENV", "test");
    expect(isRateLimitBypassed()).toBe(false);
  });
});

describe("route-level limiters with DISABLE_RATE_LIMIT=true in production", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  it("rejects the 6th /oauth/register POST from one IP within an hour", async () => {
    const post = () =>
      register(
        new NextRequest("http://localhost/oauth/register", {
          method: "POST",
          headers: { "content-type": "application/json", "x-real-ip": "198.51.100.1" },
          body: JSON.stringify({ redirect_uris: ["http://localhost:3000/cb"] }),
        })
      );

    for (let i = 0; i < RATE_LIMITS.oauthRegister.limit; i++) {
      expect((await post()).status).not.toBe(429);
    }
    expect((await post()).status).toBe(429);
  });

  it("rejects report POSTs once over RATE_LIMITS.report", async () => {
    const post = () =>
      report(
        new NextRequest("http://localhost/api/projects/proj1/report", {
          method: "POST",
          headers: { "content-type": "application/json", "x-real-ip": "198.51.100.2" },
          body: "{}",
        }),
        { params: Promise.resolve({ id: "proj1" }) }
      );

    for (let i = 0; i < RATE_LIMITS.report.limit; i++) {
      expect((await post()).status).not.toBe(429);
    }
    expect((await post()).status).toBe(429);
  });
});
