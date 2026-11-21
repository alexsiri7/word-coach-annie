import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RATE_LIMITS } from "@/lib/rate-limit-config";

const claimOfflineCache = vi.hoisted(() => vi.fn<(owner: string) => Promise<void>>(async () => {}));
vi.mock("@/lib/offline/cache-owner", () => ({ API_TOKEN_CACHE_OWNER: "api-token", claimOfflineCache }));

const signedIn = { authenticated: true, user: { userId: "u1", email: "a@example.com", name: "A" } };

function mockMe(...responses: Array<{ status: number; body: unknown }>) {
    const fetchMock = vi.fn();
    for (const { status, body } of responses) {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
    }
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

async function loadFetchCurrentUser() {
    vi.resetModules();
    return (await import("@/hooks/use-auth")).fetchCurrentUser;
}

describe("fetchCurrentUser", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        claimOfflineCache.mockReset().mockImplementation(async () => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("reuses a signed-in answer across page mounts within the auth rate-limit window", async () => {
        const fetchMock = mockMe({ status: 200, body: signedIn }, { status: 200, body: signedIn });
        const fetchCurrentUser = await loadFetchCurrentUser();

        for (let i = 0; i < 10; i++) {
            expect(await fetchCurrentUser()).toEqual(signedIn);
        }
        expect(fetchMock).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(RATE_LIMITS.auth.windowMs);
        await fetchCurrentUser();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("asks again after a signed-out or failed answer", async () => {
        const fetchMock = mockMe(
            { status: 401, body: { authenticated: false } },
            { status: 429, body: { error: "Too many requests." } },
            { status: 200, body: signedIn },
        );
        const fetchCurrentUser = await loadFetchCurrentUser();

        expect(await fetchCurrentUser()).toEqual({ authenticated: false, user: null });
        expect(await fetchCurrentUser()).toEqual({ authenticated: false, user: null });
        expect(await fetchCurrentUser()).toEqual(signedIn);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("bypasses the cache when asked for a fresh answer", async () => {
        const fetchMock = mockMe({ status: 200, body: signedIn }, { status: 401, body: { authenticated: false } });
        const fetchCurrentUser = await loadFetchCurrentUser();

        await fetchCurrentUser();
        expect(await fetchCurrentUser({ fresh: true })).toEqual({ authenticated: false, user: null });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("claims the offline cache for the signed-in user before answering", async () => {
        mockMe({ status: 200, body: signedIn });
        let release!: () => void;
        claimOfflineCache.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
        const fetchCurrentUser = await loadFetchCurrentUser();

        let answered = false;
        const answer = fetchCurrentUser().then((current) => {
            answered = true;
            return current;
        });
        await vi.waitFor(() => expect(claimOfflineCache).toHaveBeenCalledWith("u1"));
        expect(answered).toBe(false);

        release();
        expect(await answer).toEqual(signedIn);
    });

    it("claims the offline cache for a legacy API token session, which has no user", async () => {
        mockMe({ status: 200, body: { authenticated: true, user: null } });
        const fetchCurrentUser = await loadFetchCurrentUser();

        await fetchCurrentUser();

        expect(claimOfflineCache).toHaveBeenCalledWith("api-token");
    });

    it("does not claim the offline cache for a signed-out or failed answer", async () => {
        const fetchMock = mockMe({ status: 401, body: { authenticated: false } }, { status: 200, body: { authenticated: false } });
        fetchMock.mockRejectedValueOnce(new TypeError("offline"));
        const fetchCurrentUser = await loadFetchCurrentUser();

        for (let i = 0; i < 3; i++) {
            expect(await fetchCurrentUser()).toEqual({ authenticated: false, user: null });
        }
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(claimOfflineCache).not.toHaveBeenCalled();
    });
});
