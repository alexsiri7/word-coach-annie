/**
 * In-memory sliding window rate limiter.
 * Tracks request timestamps per key and enforces requests-per-window limits.
 */

interface RateLimitEntry {
    timestamps: number[];
}

interface RateLimitConfig {
    /** Maximum requests allowed in the window */
    limit: number;
    /** Window size in milliseconds */
    windowMs: number;
}

const store = new Map<string, RateLimitEntry>();

/** Evict expired entries periodically to prevent memory leaks */
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
    lastCleanup = now;

    const cutoff = now - windowMs;
    for (const [key, entry] of store) {
        entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
        if (entry.timestamps.length === 0) {
            store.delete(key);
        }
    }
}

/**
 * Check and consume a rate limit token for the given key.
 * Returns { allowed: true, remaining, resetMs } or { allowed: false, remaining: 0, resetMs, retryAfterMs }.
 */
export function checkRateLimit(
    key: string,
    config: RateLimitConfig
): {
    allowed: boolean;
    remaining: number;
    resetMs: number;
    retryAfterMs?: number;
} {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    cleanup(config.windowMs);

    let entry = store.get(key);
    if (!entry) {
        entry = { timestamps: [] };
        store.set(key, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    if (entry.timestamps.length >= config.limit) {
        // Find when the oldest timestamp in the window will expire
        const oldestInWindow = entry.timestamps[0];
        const retryAfterMs = oldestInWindow + config.windowMs - now;
        return {
            allowed: false,
            remaining: 0,
            resetMs: oldestInWindow + config.windowMs,
            retryAfterMs,
        };
    }

    entry.timestamps.push(now);
    return {
        allowed: true,
        remaining: config.limit - entry.timestamps.length,
        resetMs: now + config.windowMs,
    };
}

/** Rate limit configs */
export const RATE_LIMITS = {
    /** AI chat endpoint: 30 requests per minute per user */
    chat: { limit: 30, windowMs: 60_000 } satisfies RateLimitConfig,
    /** Read operations (GET): 120 requests per minute per user */
    read: { limit: 120, windowMs: 60_000 } satisfies RateLimitConfig,
    /** Write operations (POST/PATCH/DELETE): 60 requests per minute per user */
    write: { limit: 60, windowMs: 60_000 } satisfies RateLimitConfig,
    /** Project creation (POST /api/projects): 10 per hour per user */
    projectCreate: { limit: 10, windowMs: 3_600_000 } satisfies RateLimitConfig,
};

/** Clear all entries (for testing) */
export function resetRateLimitStore() {
    store.clear();
}
