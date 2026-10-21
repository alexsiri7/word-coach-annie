import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/offline/idb", () => ({
  clearOfflineData: vi.fn(async () => {}),
  getPendingOps: vi.fn(async () => []),
}));

vi.mock("@/lib/offline/sync-queue", () => ({
  replayPendingOps: vi.fn(async () => {}),
}));

import { clearClientData, countUnsyncedOps } from "@/lib/offline/clear-client-data";
import { clearOfflineData, getPendingOps, type PendingOp } from "@/lib/offline/idb";
import { replayPendingOps } from "@/lib/offline/sync-queue";

const store = new Map<string, string>();
const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const cacheNames = new Set<string>();
const cachesStub = {
  keys: vi.fn(async () => [...cacheNames]),
  delete: vi.fn(async (name: string) => cacheNames.delete(name)),
};

const navigatorStub = { onLine: true };

function op(id: number): PendingOp {
  return { id, url: "/api/x", method: "PUT", body: null, timestamp: id, status: "conflict", retries: 0 };
}

describe("clearClientData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("localStorage", localStorageStub);
    vi.stubGlobal("caches", cachesStub);
    store.clear();
    store.set("consent:sentry_replay", "true");
    store.set("setup-wizard-dismissed", "true");
    store.set("theme", "dark");
    cacheNames.clear();
    for (const name of ["app-shell", "pages", "others", "workbox-precache-v2-https://example.test/"]) {
      cacheNames.add(name);
    }
  });

  it("clears offline data and app-owned localStorage keys, keeping theme", async () => {
    await clearClientData();

    expect(clearOfflineData).toHaveBeenCalledOnce();
    expect(store.has("consent:sentry_replay")).toBe(false);
    expect(store.has("setup-wizard-dismissed")).toBe(false);
    expect(store.get("theme")).toBe("dark");
  });

  it("deletes runtime caches and keeps the workbox precache", async () => {
    await clearClientData();

    expect([...cacheNames]).toEqual(["workbox-precache-v2-https://example.test/"]);
  });

  it("still clears localStorage and caches when IndexedDB fails", async () => {
    vi.mocked(clearOfflineData).mockRejectedValueOnce(new Error("idb unavailable"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await clearClientData();

    expect(store.has("consent:sentry_replay")).toBe(false);
    expect(cacheNames.has("app-shell")).toBe(false);
  });

  it("does not throw when the Cache API is unavailable", async () => {
    vi.stubGlobal("caches", undefined);

    await expect(clearClientData()).resolves.toBeUndefined();
    expect(store.has("setup-wizard-dismissed")).toBe(false);
  });
});

describe("countUnsyncedOps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("navigator", navigatorStub);
  });

  it("replays the queue when online and counts what remains", async () => {
    navigatorStub.onLine = true;
    vi.mocked(getPendingOps).mockResolvedValueOnce([op(1), op(2)]);

    expect(await countUnsyncedOps()).toBe(2);
    expect(replayPendingOps).toHaveBeenCalledOnce();
  });

  it("does not replay when offline", async () => {
    navigatorStub.onLine = false;
    vi.mocked(getPendingOps).mockResolvedValueOnce([op(1)]);

    expect(await countUnsyncedOps()).toBe(1);
    expect(replayPendingOps).not.toHaveBeenCalled();
  });

  it("returns 0 when the queue cannot be read", async () => {
    navigatorStub.onLine = false;
    vi.mocked(getPendingOps).mockRejectedValueOnce(new Error("idb unavailable"));

    expect(await countUnsyncedOps()).toBe(0);
  });
});
