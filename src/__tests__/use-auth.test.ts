import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

        vi.advanceTimersByTime(60_000);
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
});
