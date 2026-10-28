/**
 * Sliding window rate limiter.
 * Uses Redis (sorted-set) when REDIS_URL is set; falls back to an in-memory
 * Map for single-instance deployments.
 */
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type Redis from "ioredis";
import { RATE_LIMITS, type RateLimitConfig } from "@/lib/rate-limit-config";

interface RateLimitEntry {
    timestamps: number[];
}

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetMs: number;
    retryAfterMs?: number;
}

// ── In-Memory Store ────────────────────────────────────────────────────────────

/** Insertion order doubles as recency order: each check moves its key to the end. */
const memStore = new Map<string, RateLimitEntry>();

/**
 * Cap on tracked keys, so a flood of distinct IPs cannot grow the store without
 * bound between cleanups. The least recently checked key is evicted first.
 */
export const MEM_STORE_MAX_ENTRIES = 10_000;

/** Evict expired entries periodically to prevent memory leaks */
const CLEANUP_INTERVAL_MS = 60_000;

/**
 * Maximum window across all rate limit configs.
 * Used as the cleanup cutoff to avoid prematurely evicting long-window
 * entries (e.g. hourly limits) when a short-window request triggers cleanup.
 */
const MAX_WINDOW_MS = Math.max(...Object.values(RATE_LIMITS).map((c) => c.windowMs));
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

    const entry = memStore.get(key) ?? { timestamps: [] };
    memStore.delete(key);
    if (memStore.size >= MEM_STORE_MAX_ENTRIES) {
        memStore.delete(memStore.keys().next().value!);
    }
    memStore.set(key, entry);
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
redis.replicate_commands()
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

-- Add this request using Redis TIME for microsecond-precision unique member key,
-- avoiding math.random's deterministic seed issue under concurrent load.
local t = redis.call('TIME')
redis.call('ZADD', key, now, now .. '-' .. t[1] .. t[2])
-- Expire after one full window to avoid orphaned keys
redis.call('PEXPIRE', key, window_ms)

return {count + 1, -1}
`;

// Stored as a Promise so concurrent callers share the same initialization
// and never create more than one Redis client.
let _redisPromise: Promise<Redis> | null = null;

async function getRedis(): Promise<Redis> {
    if (!_redisPromise) {
        _redisPromise = (async () => {
            // Loaded only when REDIS_URL is set; checkRedis is guarded by useRedis().
            const { default: RedisClass } = await import("ioredis");
            // Every proxied request is rate limited, so a down Redis must fail fast rather
            // than queue each request behind ioredis's reconnect retries.
            const client = new RedisClass(env.REDIS_URL!, { commandTimeout: 1_000, maxRetriesPerRequest: 1 });
            client.on("error", (err) => {
                logger.error("[rate-limit] Redis error:", err);
            });
            return client;
        })();
    }
    return _redisPromise;
}

async function checkRedis(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    try {
        const redis = await getRedis();
        const [rawCount, oldestScore] = await redis.eval(
            RATE_LIMIT_SCRIPT,
            1,
            key,
            now,
            windowStart,
            config.limit,
            config.windowMs
        ) as [number, number];

        // rawCount > config.limit guards against stale data races where ZCARD
        // returns a value slightly above limit before ZREMRANGEBYSCORE settles.
        if (rawCount > config.limit || oldestScore !== -1) {
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
            remaining: config.limit - rawCount,
            resetMs: now + config.windowMs,
        };
    } catch (err) {
        if (config.failOverToMemory) {
            logger.error("[rate-limit] Redis check failed, using the in-memory limiter:", err);
            return checkInMemory(key, config);
        }
        // Fail open — allow the request but log the error so ops can investigate
        logger.error("[rate-limit] Redis check failed, allowing request:", err);
        return {
            allowed: true,
            remaining: config.limit - 1,
            resetMs: now + config.windowMs,
        };
    }
}

// ── Public API ─────────────────────────────────────────────────────────────────

const useRedis = () => Boolean(env.REDIS_URL);

/**
 * Check whether the given key has exceeded its rate limit.
 *
 * Always returns a `Promise<RateLimitResult>` regardless of which backend
 * (Redis or in-memory) is active. Call sites should always `await` this.
 *
 * @param key    - Unique rate-limit bucket (e.g. `"chat:user-abc123"`)
 * @param config - Limit and window size; use a preset from `RATE_LIMITS`
 */
export async function checkRateLimit(
    key: string,
    config: RateLimitConfig
): Promise<RateLimitResult> {
    if (useRedis()) return checkRedis(key, config);
    return checkInMemory(key, config);
}

export { RATE_LIMITS };

/**
 * Whether DISABLE_RATE_LIMIT=true lets E2E / CI runs skip rate limiting.
 * Never honoured in production, so a leaked flag cannot switch the limits off there.
 */
export function isRateLimitBypassed(): boolean {
    if (process.env.DISABLE_RATE_LIMIT !== "true") return false;
    if (process.env.NODE_ENV === "production") {
        logger.warn("[rate-limit] DISABLE_RATE_LIMIT=true is ignored in production");
        return false;
    }
    return true;
}

/** Clear all in-memory entries (for testing — in-memory mode only) */
export function resetRateLimitStore() {
    memStore.clear();
}

/** Number of keys in the in-memory store (for testing only) */
export function rateLimitStoreSize(): number {
    return memStore.size;
}

/** Reset the Redis client singleton (for testing only) */
export function resetRedisClient() {
    _redisPromise = null;
}
