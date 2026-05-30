/**
 * Sliding window rate limiter.
 * Uses Redis (sorted-set) when REDIS_URL is set; falls back to an in-memory
 * Map for single-instance deployments.
 *
 * ioredis is loaded lazily via dynamic import with webpackIgnore so it is NOT
 * bundled into the Edge runtime (middleware). Edge always uses in-memory mode.
 */
import { env } from "@/lib/env";
import type Redis from "ioredis";

interface RateLimitEntry {
    timestamps: number[];
}

interface RateLimitConfig {
    /** Maximum requests allowed in the window */
    limit: number;
    /** Window size in milliseconds */
    windowMs: number;
}

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetMs: number;
    retryAfterMs?: number;
}

// ── In-Memory Store ────────────────────────────────────────────────────────────

const memStore = new Map<string, RateLimitEntry>();

/** Evict expired entries periodically to prevent memory leaks */
const CLEANUP_INTERVAL_MS = 60_000;

/**
 * Maximum window across all rate limit configs.
 * Used as the cleanup cutoff to avoid prematurely evicting long-window
 * entries (e.g. hourly limits) when a short-window request triggers cleanup.
 */
const MAX_WINDOW_MS = 3_600_000; // 1 hour — matches the longest windowMs in RATE_LIMITS
let lastCleanup = Date.now();

function memCleanup() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
    lastCleanup = now;
    const cutoff = now - MAX_WINDOW_MS;
    for (const [key, entry] of memStore) {
        entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
        if (entry.timestamps.length === 0) memStore.delete(key);
    }
}

function checkInMemory(key: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    memCleanup();

    let entry = memStore.get(key);
    if (!entry) {
        entry = { timestamps: [] };
        memStore.set(key, entry);
    }
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    if (entry.timestamps.length >= config.limit) {
        const oldestInWindow = entry.timestamps[0];
        return {
            allowed: false,
            remaining: 0,
            resetMs: oldestInWindow + config.windowMs,
            retryAfterMs: oldestInWindow + config.windowMs - now,
        };
    }
    entry.timestamps.push(now);
    return {
        allowed: true,
        remaining: config.limit - entry.timestamps.length,
        resetMs: now + config.windowMs,
    };
}

// ── Redis Store ────────────────────────────────────────────────────────────────

// Lua script for atomic sliding-window check-and-consume.
// Arguments: key, now (ms), windowStart (ms), limit, windowMs (ms)
// Returns: [count_after, oldest_in_window_or_-1]
const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local window_ms = tonumber(ARGV[4])

-- Remove expired entries
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- Current count
local count = redis.call('ZCARD', key)

if count >= limit then
  -- Return oldest member score so caller can compute retryAfterMs
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {count, tonumber(oldest[2] or now)}
end

-- Add this request
redis.call('ZADD', key, now, now .. '-' .. math.random(1e9))
-- Expire after one full window to avoid orphaned keys
redis.call('PEXPIRE', key, window_ms)

return {count + 1, -1}
`;

let _redis: Redis | null = null;

async function getRedis(): Promise<Redis> {
    if (!_redis) {
        // Dynamic import with webpackIgnore keeps ioredis out of the Edge bundle.
        // This function is only called from checkRedis, which is guarded by useRedis().
        const { default: RedisClass } = await import(/* webpackIgnore: true */ "ioredis") as { default: typeof Redis };
        _redis = new RedisClass(env.REDIS_URL!);
        _redis.on("error", (err) => {
            console.error("[rate-limit] Redis error:", err);
        });
    }
    return _redis;
}

async function checkRedis(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    try {
        const redis = await getRedis();
        const [countAfter, oldestScore] = await redis.eval(
            RATE_LIMIT_SCRIPT,
            1,
            key,
            now,
            windowStart,
            config.limit,
            config.windowMs
        ) as [number, number];

        if (countAfter > config.limit || oldestScore !== -1) {
            const retryAfterMs = oldestScore + config.windowMs - now;
            return {
                allowed: false,
                remaining: 0,
                resetMs: oldestScore + config.windowMs,
                retryAfterMs: Math.max(0, retryAfterMs),
            };
        }

        return {
            allowed: true,
            remaining: config.limit - countAfter,
            resetMs: now + config.windowMs,
        };
    } catch (err) {
        // Fail open — allow the request but log the error so ops can investigate
        console.error("[rate-limit] Redis check failed, allowing request:", err);
        return {
            allowed: true,
            remaining: config.limit - 1,
            resetMs: now + config.windowMs,
        };
    }
}

// ── Public API ─────────────────────────────────────────────────────────────────

// Edge runtime (middleware) cannot use ioredis — always falls back to in-memory
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isEdgeRuntime = typeof (globalThis as any).EdgeRuntime !== "undefined";
const useRedis = () => !isEdgeRuntime && Boolean(env.REDIS_URL);

export function checkRateLimit(
    key: string,
    config: RateLimitConfig
): RateLimitResult | Promise<RateLimitResult> {
    if (useRedis()) return checkRedis(key, config);
    return checkInMemory(key, config);
}

/** Rate limit configs */
export const RATE_LIMITS = {
    /** AI chat endpoint: 30 requests per minute per user */
    chat: { limit: 30, windowMs: 60_000 } satisfies RateLimitConfig,
    /** Read operations (GET): 120 requests per minute per user */
    read: { limit: 120, windowMs: 60_000 } satisfies RateLimitConfig,
    /** Write operations (POST/PATCH/DELETE): 60 requests per minute per user */
    write: { limit: 60, windowMs: 60_000 } satisfies RateLimitConfig,
    /** Project creation (POST /api/projects): 100 per hour per user */
    projectCreate: { limit: 100, windowMs: 3_600_000 } satisfies RateLimitConfig,
    /** Project import (POST /api/projects/import): 20 per hour per user */
    projectImport: { limit: 20, windowMs: 3_600_000 } satisfies RateLimitConfig,
    /** Feedback submission (POST /api/feedback): 5 per hour per user */
    feedback: { limit: 5, windowMs: 3_600_000 } satisfies RateLimitConfig,
    /** Auth endpoints (login): 5 attempts per minute per IP — brute-force protection */
    auth: { limit: 5, windowMs: 60_000 } satisfies RateLimitConfig,
};

/** Clear all entries (for testing — in-memory mode only) */
export function resetRateLimitStore() {
    memStore.clear();
}
