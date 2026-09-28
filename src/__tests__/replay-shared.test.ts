import { describe, it, expect, vi, afterEach } from "vitest";
import {
  REPLAY_LOCK_NAME,
  createSessionRefresher,
  replayFetch,
  withReplayLock,
} from "@/lib/offline/replay-shared";

const op = { url: "/api/nodes/x", method: "PATCH", body: "{}" };

function opFetchCount(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => url === op.url).length;
}

describe("replay-shared", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("replayFetch", () => {
    it("returns a non-401 response without refreshing", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));
      const refresh = vi.fn();

      const res = await replayFetch(op, refresh);

      expect(res.status).toBe(500);
      expect(refresh).not.toHaveBeenCalled();
    });

    it("re-sends once after a successful refresh on 401", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response("{}", { status: 401 }))
        .mockResolvedValueOnce(new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const res = await replayFetch(op, async () => true);

      expect(res.status).toBe(200);
      expect(opFetchCount(fetchMock)).toBe(2);
    });

    it("returns the 401 without re-sending when refresh fails", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
      vi.stubGlobal("fetch", fetchMock);

      const res = await replayFetch(op, async () => false);

      expect(res.status).toBe(401);
      expect(opFetchCount(fetchMock)).toBe(1);
    });

    it("gives up after a second 401", async () => {
      const fetchMock = vi.fn().mockImplementation(async () => new Response("{}", { status: 401 }));
      vi.stubGlobal("fetch", fetchMock);

      const res = await replayFetch(op, async () => true);

      expect(res.status).toBe(401);
      expect(opFetchCount(fetchMock)).toBe(2);
    });
  });

  describe("createSessionRefresher", () => {
    it("calls /api/auth/refresh at most once", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      const refresh = createSessionRefresher();

      const results = await Promise.all([refresh(), refresh(), refresh()]);

      expect(results).toEqual([true, true, true]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/refresh", { method: "POST" });
    });

    it("resolves false when the refresh request fails", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

      await expect(createSessionRefresher()()).resolves.toBe(false);
    });
  });

  describe("withReplayLock", () => {
    it("runs under the shared Web Lock when available", async () => {
      const request = vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn());
      vi.stubGlobal("navigator", { locks: { request } });

      await expect(withReplayLock(async () => "done")).resolves.toBe("done");
      expect(request).toHaveBeenCalledWith(REPLAY_LOCK_NAME, expect.any(Function));
    });

    it("runs directly without Web Locks support", async () => {
      vi.stubGlobal("navigator", {});

      await expect(withReplayLock(async () => "done")).resolves.toBe("done");
    });
  });
});
