/**
 * Simple in-memory TTL cache for MCP server reads.
 *
 * Designed to avoid repeated DB queries during a single agent session.
 * The cache lives in the Node.js process — it resets when the MCP server restarts.
 */
import { trace } from "@opentelemetry/api";
import { logger } from "@/lib/logger";

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

/** Add a cache event to the current active span (if any). */
function addCacheEvent(eventName: string, attrs: Record<string, string | number>) {
    const span = trace.getActiveSpan();
    if (span) {
        span.addEvent(eventName, attrs);
    }
}

export class TTLCache {
    private store = new Map<string, CacheEntry<unknown>>();
    private defaultTTL: number;

    /**
     * @param defaultTTLMs Default time-to-live in milliseconds (default: 30 seconds)
     */
    constructor(defaultTTLMs: number = 30_000) {
        this.defaultTTL = defaultTTLMs;
        // Proactively sweep expired entries every 60s so they don't linger
        // if never re-accessed. .unref() prevents this timer from blocking exit.
        setInterval(() => {
            try {
                const now = Date.now();
                for (const [key, entry] of this.store) {
                    if (now > entry.expiresAt) {
                        this.store.delete(key);
                    }
                }
            } catch (err) {
                // Defensive: sweep must never crash the process
                logger.error("TTLCache sweep error", err);
            }
        }, 60_000).unref();
    }

    get<T>(key: string): T | undefined {
        const entry = this.store.get(key);
        if (!entry) {
            addCacheEvent("cache.miss", { "cache.key": key });
            return undefined;
        }
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            addCacheEvent("cache.miss", { "cache.key": key, "cache.reason": "expired" });
            return undefined;
        }
        addCacheEvent("cache.hit", { "cache.key": key });
        return entry.value as T;
    }

    set<T>(key: string, value: T, ttlMs?: number): void {
        this.store.set(key, {
            value,
            expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
        });
    }

    /**
     * Get a cached value or compute it. Returns the cached value if available,
     * otherwise calls the factory, caches the result, and returns it.
     */
    async getOrSet<T>(key: string, factory: () => Promise<T>, ttlMs?: number): Promise<T> {
        const cached = this.get<T>(key);
        if (cached !== undefined) return cached;
        const value = await factory();
        this.set(key, value, ttlMs);
        return value;
    }

    /** Invalidate a single key. */
    delete(key: string): void {
        this.store.delete(key);
    }

    /** Invalidate all keys matching a prefix. */
    invalidatePrefix(prefix: string): void {
        let count = 0;
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix)) {
                this.store.delete(key);
                count++;
            }
        }
        if (count > 0) {
            addCacheEvent("cache.invalidate", { "cache.prefix": prefix, "cache.invalidated_count": count });
        }
    }

    /** Invalidate everything. */
    clear(): void {
        const count = this.store.size;
        this.store.clear();
        if (count > 0) {
            addCacheEvent("cache.clear", { "cache.invalidated_count": count });
        }
    }

    /** Number of entries (including expired ones not yet evicted). */
    get size(): number {
        return this.store.size;
    }
}

/** Shared cache instance for MCP tool reads. 30s default TTL. */
export const mcpCache = new TTLCache(30_000);
