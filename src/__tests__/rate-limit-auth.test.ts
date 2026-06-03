import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit, RATE_LIMITS, resetRateLimitStore } from "@/lib/rate-limit";

describe("rate limiting on auth login path", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
    resetRateLimitStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", async () => {
    for (let i = 0; i < RATE_LIMITS.auth.limit; i++) {
      const result = await checkRateLimit(`auth:192.168.1.1`, RATE_LIMITS.auth);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks the N+1 request from the same IP", async () => {
    const ip = "10.0.0.1";
    for (let i = 0; i < RATE_LIMITS.auth.limit; i++) {
      await checkRateLimit(`auth:${ip}`, RATE_LIMITS.auth);
    }

    const result = await checkRateLimit(`auth:${ip}`, RATE_LIMITS.auth);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("returns retryAfterMs when rate limited", async () => {
    const ip = "10.0.0.2";
    for (let i = 0; i < RATE_LIMITS.auth.limit; i++) {
      await checkRateLimit(`auth:${ip}`, RATE_LIMITS.auth);
    }

    const result = await checkRateLimit(`auth:${ip}`, RATE_LIMITS.auth);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeDefined();
    expect(result.retryAfterMs!).toBeGreaterThan(0);
    expect(result.retryAfterMs!).toBeLessThanOrEqual(RATE_LIMITS.auth.windowMs);
  });

  it("different IPs have independent buckets", async () => {
    const ipA = "10.0.0.10";
    const ipB = "10.0.0.11";

    // Exhaust IP A
    for (let i = 0; i < RATE_LIMITS.auth.limit; i++) {
      await checkRateLimit(`auth:${ipA}`, RATE_LIMITS.auth);
    }

    // IP A is blocked
    const resultA = await checkRateLimit(`auth:${ipA}`, RATE_LIMITS.auth);
    expect(resultA.allowed).toBe(false);

    // IP B should still be allowed
    const resultB = await checkRateLimit(`auth:${ipB}`, RATE_LIMITS.auth);
    expect(resultB.allowed).toBe(true);
  });

  it("allows requests again after the window expires", async () => {
    const ip = "10.0.0.20";

    // Exhaust the limit
    for (let i = 0; i < RATE_LIMITS.auth.limit; i++) {
      await checkRateLimit(`auth:${ip}`, RATE_LIMITS.auth);
    }

    const blocked = await checkRateLimit(`auth:${ip}`, RATE_LIMITS.auth);
    expect(blocked.allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(RATE_LIMITS.auth.windowMs + 1);

    const allowed = await checkRateLimit(`auth:${ip}`, RATE_LIMITS.auth);
    expect(allowed.allowed).toBe(true);
  });
});
