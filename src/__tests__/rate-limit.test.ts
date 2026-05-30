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

    it("allows requests within the limit", async () => {
        const config = { limit: 5, windowMs: 60_000 };
        for (let i = 0; i < 5; i++) {
            const result = await checkRateLimit("user-1", config);
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(4 - i);
        }
    });

    it("blocks requests exceeding the limit", async () => {
        const config = { limit: 3, windowMs: 60_000 };
        for (let i = 0; i < 3; i++) {
            await checkRateLimit("user-1", config);
        }
        const result = await checkRateLimit("user-1", config);
        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it("tracks users independently", async () => {
        const config = { limit: 2, windowMs: 60_000 };
        await checkRateLimit("user-a", config);
        await checkRateLimit("user-a", config);

        // user-a is at limit
        expect((await checkRateLimit("user-a", config)).allowed).toBe(false);

        // user-b is fresh
        expect((await checkRateLimit("user-b", config)).allowed).toBe(true);
    });

    it("tracks different prefixes independently", async () => {
        const config = { limit: 1, windowMs: 60_000 };
        await checkRateLimit("chat:user-1", config);
        expect((await checkRateLimit("chat:user-1", config)).allowed).toBe(false);

        // Different prefix, same user — separate bucket
        expect((await checkRateLimit("api:user-1", config)).allowed).toBe(true);
    });

    it("has correct default configs", () => {
        expect(RATE_LIMITS.chat.limit).toBe(30);
        expect(RATE_LIMITS.chat.windowMs).toBe(60_000);
        expect(RATE_LIMITS.read.limit).toBe(120);
        expect(RATE_LIMITS.read.windowMs).toBe(60_000);
        expect(RATE_LIMITS.write.limit).toBe(60);
        expect(RATE_LIMITS.write.windowMs).toBe(60_000);
        expect(RATE_LIMITS.projectCreate.limit).toBe(100);
        expect(RATE_LIMITS.projectCreate.windowMs).toBe(3_600_000);
        expect(RATE_LIMITS.feedback.limit).toBe(5);
        expect(RATE_LIMITS.feedback.windowMs).toBe(3_600_000);
    });

    it("provides retryAfterMs on rejection", async () => {
        const config = { limit: 1, windowMs: 60_000 };
        await checkRateLimit("user-1", config);
        const result = await checkRateLimit("user-1", config);
        expect(result.allowed).toBe(false);
        expect(result.retryAfterMs).toBeDefined();
        expect(result.retryAfterMs).toBeGreaterThan(0);
        expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
    });

    it("uses in-memory store when REDIS_URL is not set", async () => {
        // process.env.REDIS_URL is undefined in test environment
        const result = await checkRateLimit("user-1", { limit: 5, windowMs: 60_000 });
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4);
    });
});
