import { describe, it, expect, beforeEach, vi } from "vitest";
import { TTLCache } from "@/lib/cache";

describe("TTLCache", () => {
    let cache: TTLCache;

    beforeEach(() => {
        cache = new TTLCache(1000); // 1s default TTL
    });

    it("returns undefined for missing keys", () => {
        expect(cache.get("missing")).toBeUndefined();
    });

    it("stores and retrieves values", () => {
        cache.set("key", { data: 42 });
        expect(cache.get("key")).toEqual({ data: 42 });
    });

    it("expires entries after TTL", () => {
        vi.useFakeTimers();
        try {
            cache.set("key", "value", 500);
            expect(cache.get("key")).toBe("value");

            vi.advanceTimersByTime(501);
            expect(cache.get("key")).toBeUndefined();
        } finally {
            vi.useRealTimers();
        }
    });

    it("sweeps expired entries on 60-second interval", () => {
        vi.useFakeTimers();
        try {
            const sweepCache = new TTLCache(1000);
            sweepCache.set("soon", "x", 500);
            sweepCache.set("later", "y", 120_000);

            vi.advanceTimersByTime(60_001);

            // "soon" expired before the sweep fired; "later" has not
            expect(sweepCache.size).toBe(1);
            expect(sweepCache.get("later")).toBe("y");
        } finally {
            vi.useRealTimers();
        }
    });

    it("getOrSet returns cached value on hit", async () => {
        const factory = vi.fn().mockResolvedValue("computed");
        cache.set("key", "cached");

        const result = await cache.getOrSet("key", factory);
        expect(result).toBe("cached");
        expect(factory).not.toHaveBeenCalled();
    });

    it("getOrSet calls factory on miss and caches result", async () => {
        const factory = vi.fn().mockResolvedValue("computed");

        const result1 = await cache.getOrSet("key", factory);
        expect(result1).toBe("computed");
        expect(factory).toHaveBeenCalledTimes(1);

        const result2 = await cache.getOrSet("key", factory);
        expect(result2).toBe("computed");
        expect(factory).toHaveBeenCalledTimes(1); // not called again
    });

    it("delete removes a single key", () => {
        cache.set("a", 1);
        cache.set("b", 2);
        cache.delete("a");
        expect(cache.get("a")).toBeUndefined();
        expect(cache.get("b")).toBe(2);
    });

    it("invalidatePrefix removes matching keys", () => {
        cache.set("projects:list:20:0", "list");
        cache.set("projects:list:10:0", "list2");
        cache.set("project:abc", "detail");
        cache.set("outline:xyz", "outline");

        cache.invalidatePrefix("projects:");
        expect(cache.get("projects:list:20:0")).toBeUndefined();
        expect(cache.get("projects:list:10:0")).toBeUndefined();
        expect(cache.get("project:abc")).toBe("detail"); // not prefixed with "projects:"
        expect(cache.get("outline:xyz")).toBe("outline");
    });

    it("clear removes all entries", () => {
        cache.set("a", 1);
        cache.set("b", 2);
        cache.clear();
        expect(cache.size).toBe(0);
    });
});
