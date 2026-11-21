import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/offline/clear-client-data", () => ({
  clearClientData: vi.fn(async () => {}),
}));

vi.mock("@/lib/offline/idb", () => ({
  clearOfflineData: vi.fn(async () => {}),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { claimOfflineCache } from "@/lib/offline/cache-owner";
import { clearClientData } from "@/lib/offline/clear-client-data";
import { clearOfflineData } from "@/lib/offline/idb";
import { OFFLINE_CACHE_OWNER_KEY } from "@/lib/constants";

const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

describe("claimOfflineCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    vi.stubGlobal("localStorage", localStorageStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves the cache alone when it already belongs to the signed-in user", async () => {
    store.set(OFFLINE_CACHE_OWNER_KEY, "u1");

    await claimOfflineCache("u1");

    expect(clearClientData).not.toHaveBeenCalled();
    expect(clearOfflineData).not.toHaveBeenCalled();
  });

  it("wipes another user's data, including queued writes, before taking the cache", async () => {
    store.set(OFFLINE_CACHE_OWNER_KEY, "u1");
    vi.mocked(clearClientData).mockImplementationOnce(async () => {
      expect(store.get(OFFLINE_CACHE_OWNER_KEY)).toBe("u1");
    });

    await claimOfflineCache("u2");

    expect(clearClientData).toHaveBeenCalledOnce();
    expect(clearOfflineData).not.toHaveBeenCalled();
    expect(store.get(OFFLINE_CACHE_OWNER_KEY)).toBe("u2");
  });

  it("clears an unowned cache's reads but keeps its queued writes", async () => {
    await claimOfflineCache("u1");

    expect(clearOfflineData).toHaveBeenCalledWith({ keepPendingOps: true });
    expect(clearClientData).not.toHaveBeenCalled();
    expect(store.get(OFFLINE_CACHE_OWNER_KEY)).toBe("u1");
  });

  it("does not record an owner when the clear fails, so the next claim retries", async () => {
    vi.mocked(clearOfflineData).mockRejectedValueOnce(new Error("blocked"));

    await expect(claimOfflineCache("u1")).resolves.toBeUndefined();

    expect(store.has(OFFLINE_CACHE_OWNER_KEY)).toBe(false);
  });

  it("resolves when localStorage is unavailable", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
    });

    await expect(claimOfflineCache("u1")).resolves.toBeUndefined();
  });
});
