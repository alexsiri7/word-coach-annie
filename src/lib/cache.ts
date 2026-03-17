/**
 * Simple in-memory TTL cache for MCP server reads.
 *
 * Designed to avoid repeated DB queries during a single agent session.
 * The cache lives in the Node.js process — it resets when the MCP server restarts.
 */

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

export class TTLCache {
    private store = new Map<string, CacheEntry<unknown>>();
    private defaultTTL: number;

    /**
     * @param defaultTTLMs Default time-to-live in milliseconds (default: 30 seconds)
     */
    constructor(defaultTTLMs: number = 30_000) {
        this.defaultTTL = defaultTTLMs;
    }

    get<T>(key: string): T | undefined {
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
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
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix)) {
                this.store.delete(key);
            }
        }
    }

    /** Invalidate everything. */
    clear(): void {
        this.store.clear();
    }

    /** Number of entries (including expired ones not yet evicted). */
    get size(): number {
        return this.store.size;
    }
}

/** Shared cache instance for MCP tool reads. 30s default TTL. */
export const mcpCache = new TTLCache(30_000);
