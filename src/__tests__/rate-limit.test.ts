import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    checkRateLimit,
    resetRateLimitStore,
    resetRedisClient,
    RATE_LIMITS,
    MEM_STORE_MAX_ENTRIES,
    rateLimitStoreSize,
} from "@/lib/rate-limit";

// Mock ioredis so Redis path tests never touch a real server
const mockEval = vi.fn();

vi.mock("ioredis", () => ({
    default: vi.fn().mockImplementation(function () {
        return {
            eval: mockEval,
            on: vi.fn(),
        };
    }),
}));

// ── In-Memory Path ─────────────────────────────────────────────────────────────

describe("rate-limit — in-memory path", () => {
    beforeEach(() => {
        resetRateLimitStore();
        delete process.env.REDIS_URL;
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
        expect(RATE_LIMITS.report.limit).toBe(10);
        expect(RATE_LIMITS.report.windowMs).toBe(3_600_000);
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
        expect(mockEval).not.toHaveBeenCalled();
    });
});

// ── Redis Path ─────────────────────────────────────────────────────────────────

describe("rate-limit — Redis path", () => {
    beforeEach(() => {
        resetRateLimitStore();
        resetRedisClient();
        mockEval.mockReset();
        process.env.REDIS_URL = "redis://localhost:6379";
    });

    afterEach(() => {
        delete process.env.REDIS_URL;
        resetRedisClient();
    });

    it("allows request when Redis returns count below limit", async () => {
        // Lua returns [count_after=1, oldest=-1] — allowed
        mockEval.mockResolvedValueOnce([1, -1]);
        const result = await checkRateLimit("user-1", { limit: 5, windowMs: 60_000 });
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4); // limit - rawCount = 5 - 1
        expect(result.resetMs).toBeGreaterThan(Date.now());
    });

    it("blocks request when Redis returns oldest score (count at limit)", async () => {
        const oldestScore = Date.now() - 30_000; // 30 s ago
        // Lua returns [count=5, oldest_score] — rejected
        mockEval.mockResolvedValueOnce([5, oldestScore]);
        const result = await checkRateLimit("user-1", { limit: 5, windowMs: 60_000 });
        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.retryAfterMs).toBeGreaterThanOrEqual(0);
        expect(result.resetMs).toBe(oldestScore + 60_000);
    });

    it("blocks when rawCount exceeds limit (stale data guard)", async () => {
        // rawCount > limit triggers the defensive guard
        mockEval.mockResolvedValueOnce([6, Date.now() - 5_000]);
        const result = await checkRateLimit("user-1", { limit: 5, windowMs: 60_000 });
        expect(result.allowed).toBe(false);
    });

    it("fails open when Redis eval throws", async () => {
        mockEval.mockRejectedValueOnce(new Error("ECONNREFUSED"));
        const result = await checkRateLimit("user-1", { limit: 5, windowMs: 60_000 });
        // Deliberate fail-open: must allow the request
        expect(result.allowed).toBe(true);
    });

    it("concurrent getRedis calls share a single client", async () => {
        // Both calls resolve to allowed; the ioredis constructor should be called once
        mockEval.mockResolvedValue([1, -1]);
        const { default: IORedisMock } = await import("ioredis");
        const constructorSpy = IORedisMock as unknown as ReturnType<typeof vi.fn>;
        constructorSpy.mockClear();

        await Promise.all([
            checkRateLimit("user-a", { limit: 5, windowMs: 60_000 }),
            checkRateLimit("user-b", { limit: 5, windowMs: 60_000 }),
        ]);

        // Only one Redis client created regardless of concurrency
        expect(constructorSpy.mock.calls.length).toBe(1);
    });
});

// ── Auth bucket on Redis failure ───────────────────────────────────────────────

describe("rate-limit — auth bucket when Redis fails", () => {
    beforeEach(() => {
        resetRateLimitStore();
        resetRedisClient();
        mockEval.mockReset();
        mockEval.mockRejectedValue(new Error("ECONNREFUSED"));
        process.env.REDIS_URL = "redis://localhost:6379";
    });

    afterEach(() => {
        delete process.env.REDIS_URL;
        resetRedisClient();
    });

    it("enforces the auth limit in memory instead of allowing every request", async () => {
        for (let i = 0; i < RATE_LIMITS.auth.limit; i++) {
            expect((await checkRateLimit("auth:10.0.0.1", RATE_LIMITS.auth)).allowed).toBe(true);
        }
        const blocked = await checkRateLimit("auth:10.0.0.1", RATE_LIMITS.auth);
        expect(blocked.allowed).toBe(false);
        expect(mockEval).toHaveBeenCalledTimes(RATE_LIMITS.auth.limit + 1);
    });

    it("keeps other buckets fail-open", async () => {
        for (let i = 0; i < RATE_LIMITS.chat.limit + 1; i++) {
            expect((await checkRateLimit("chat:user-1", RATE_LIMITS.chat)).allowed).toBe(true);
        }
    });
});

// ── In-memory store bound ──────────────────────────────────────────────────────

describe("rate-limit — in-memory store bound", () => {
    beforeEach(() => {
        resetRateLimitStore();
        delete process.env.REDIS_URL;
    });

    it("keeps the store at or below its cap, evicting the least recently checked key", async () => {
        const config = { limit: 1, windowMs: 60_000 };
        await checkRateLimit("ip-0", config);
        await checkRateLimit("ip-1", config);
        for (let i = 2; i < MEM_STORE_MAX_ENTRIES; i++) await checkRateLimit(`ip-${i}`, config);
        // ip-0 is checked again, so ip-1 becomes the least recently checked key
        expect((await checkRateLimit("ip-0", config)).allowed).toBe(false);

        await checkRateLimit("ip-overflow", config);

        expect(rateLimitStoreSize()).toBe(MEM_STORE_MAX_ENTRIES);
        expect((await checkRateLimit("ip-0", config)).allowed).toBe(false);
        expect((await checkRateLimit("ip-1", config)).allowed).toBe(true);
    });
});
