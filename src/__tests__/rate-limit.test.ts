import { describe, it, expect, beforeEach } from "vitest";
import {
    checkRateLimit,
    resetRateLimitStore,
    RATE_LIMITS,
} from "@/lib/rate-limit";

describe("rate-limit", () => {
    beforeEach(() => {
        resetRateLimitStore();
    });

    it("allows requests within the limit", () => {
        const config = { limit: 5, windowMs: 60_000 };
        for (let i = 0; i < 5; i++) {
            const result = checkRateLimit("user-1", config);
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(4 - i);
        }
    });

    it("blocks requests exceeding the limit", () => {
        const config = { limit: 3, windowMs: 60_000 };
        for (let i = 0; i < 3; i++) {
            checkRateLimit("user-1", config);
        }
        const result = checkRateLimit("user-1", config);
        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it("tracks users independently", () => {
        const config = { limit: 2, windowMs: 60_000 };
        checkRateLimit("user-a", config);
        checkRateLimit("user-a", config);

        // user-a is at limit
        expect(checkRateLimit("user-a", config).allowed).toBe(false);

        // user-b is fresh
        expect(checkRateLimit("user-b", config).allowed).toBe(true);
    });

    it("tracks different prefixes independently", () => {
        const config = { limit: 1, windowMs: 60_000 };
        checkRateLimit("chat:user-1", config);
        expect(checkRateLimit("chat:user-1", config).allowed).toBe(false);

        // Different prefix, same user — separate bucket
        expect(checkRateLimit("api:user-1", config).allowed).toBe(true);
    });

    it("has correct default configs", () => {
        expect(RATE_LIMITS.chat.limit).toBe(30);
        expect(RATE_LIMITS.chat.windowMs).toBe(60_000);
        expect(RATE_LIMITS.read.limit).toBe(120);
        expect(RATE_LIMITS.read.windowMs).toBe(60_000);
        expect(RATE_LIMITS.write.limit).toBe(60);
        expect(RATE_LIMITS.write.windowMs).toBe(60_000);
        expect(RATE_LIMITS.projectCreate.limit).toBe(10);
        expect(RATE_LIMITS.projectCreate.windowMs).toBe(3_600_000);
        expect(RATE_LIMITS.feedback.limit).toBe(5);
        expect(RATE_LIMITS.feedback.windowMs).toBe(3_600_000);
    });

    it("provides retryAfterMs on rejection", () => {
        const config = { limit: 1, windowMs: 60_000 };
        checkRateLimit("user-1", config);
        const result = checkRateLimit("user-1", config);
        expect(result.allowed).toBe(false);
        expect(result.retryAfterMs).toBeDefined();
        expect(result.retryAfterMs).toBeGreaterThan(0);
        expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
    });
});
