import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api-auth")>();
    return { ...actual, getCurrentUserId: vi.fn(() => null as string | null) };
});

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { getCurrentUserId } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

const CLOSE_DATE = new Date("2030-04-01T00:00:00.000Z");

function tokenRequest(method: string, csrf = true): NextRequest {
    return new NextRequest("http://localhost/api/account/calendar-feed", {
        method,
        headers: csrf ? { "x-csrf-protection": "1" } : {},
    });
}

async function readToken(): Promise<string> {
    const { GET } = await import("@/app/api/account/calendar-feed/route");
    const res = await GET(tokenRequest("GET"));
    expect(res.status).toBe(200);
    const { feedPath } = (await res.json()) as { feedPath: string };
    return feedPath.replace("/api/calendar/opportunities/", "");
}

async function fetchFeed(pathSegment: string) {
    const { GET } = await import("@/app/api/calendar/opportunities/[token]/route");
    const request = new NextRequest(`http://localhost/api/calendar/opportunities/${pathSegment}`);
    return GET(request, { params: Promise.resolve({ token: pathSegment }) });
}

describe("Calendar feed", () => {
    let userId: string;
    let providerId: string;

    beforeEach(async () => {
        vi.clearAllMocks();
        const user = await prisma.user.create({
            data: { id: "feed-user", email: "feed@test.com", googleId: "google-feed" },
        });
        userId = user.id;
        const provider = await prisma.provider.create({ data: { userId, name: "Contest Org" } });
        providerId = provider.id;
        vi.mocked(getCurrentUserId).mockReturnValue(userId);
    });

    function createOpportunity(data: Record<string, unknown> = {}) {
        return prisma.opportunity.create({
            data: { userId, providerId, title: "Spring Prize", closeDate: CLOSE_DATE, ...data },
        });
    }

    describe("token endpoint", () => {
        it("mints a token on first read and keeps returning the same one", async () => {
            const first = await readToken();
            expect(first).toMatch(/^[\w-]{20,}\.ics$/);
            expect(await readToken()).toBe(first);
        });

        it("returns the token another request committed rather than one it minted itself", async () => {
            const { CalendarFeedController } = await import("@/lib/controllers/calendar-feed");
            const committed = "committed-by-a-concurrent-request";
            await prisma.user.update({ where: { id: userId }, data: { calendarFeedToken: committed } });

            // The read that decides "no token yet" is stale by the time the write lands.
            const staleRead = vi
                .spyOn(prisma.user, "findUnique")
                .mockResolvedValueOnce({ calendarFeedToken: null } as never);
            let issued: string;
            try {
                issued = await CalendarFeedController.getOrCreateToken(userId);
            } finally {
                staleRead.mockRestore();
            }

            expect(issued).toBe(committed);
            const stored = await prisma.user.findUnique({
                where: { id: userId },
                select: { calendarFeedToken: true },
            });
            expect(stored?.calendarFeedToken).toBe(committed);
            expect((await fetchFeed(`${issued}.ics`)).status).toBe(200);
        });

        it("hands concurrent first reads the same persisted token", async () => {
            const { CalendarFeedController } = await import("@/lib/controllers/calendar-feed");

            const [first, second] = await Promise.all([
                CalendarFeedController.getOrCreateToken(userId),
                CalendarFeedController.getOrCreateToken(userId),
            ]);

            expect(first).toBe(second);
            expect((await fetchFeed(`${first}.ics`)).status).toBe(200);
        });

        it("returns 401 when unauthenticated", async () => {
            vi.mocked(getCurrentUserId).mockReturnValue(null);
            const { GET } = await import("@/app/api/account/calendar-feed/route");
            expect((await GET(tokenRequest("GET"))).status).toBe(401);
        });

        it("rejects a regenerate request without the CSRF header", async () => {
            const { POST } = await import("@/app/api/account/calendar-feed/route");
            expect((await POST(tokenRequest("POST", false))).status).toBe(403);
        });

        it("regenerating invalidates the previous URL", async () => {
            const original = await readToken();
            expect((await fetchFeed(original)).status).toBe(200);

            const { POST } = await import("@/app/api/account/calendar-feed/route");
            const res = await POST(tokenRequest("POST"));
            expect(res.status).toBe(200);
            const { feedPath } = (await res.json()) as { feedPath: string };
            const regenerated = feedPath.replace("/api/calendar/opportunities/", "");

            expect(regenerated).not.toBe(original);
            expect((await fetchFeed(original)).status).toBe(404);
            expect((await fetchFeed(regenerated)).status).toBe(200);
        });
    });

    describe("feed endpoint", () => {
        it("serves an opportunity with no candidates as an all-day event", async () => {
            const opportunity = await createOpportunity({
                rulesUrl: "https://example.com/rules",
                entryFee: "£10",
                wordLimit: 2000,
                lineLimit: 40,
                genreRestrictions: "Literary fiction",
            });

            const res = await fetchFeed(await readToken());

            expect(res.status).toBe(200);
            expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
            expect(res.headers.get("cache-control")).toBe("private, max-age=900");

            const body = await res.text();
            expect(body).toContain(`UID:opportunity-${opportunity.id}@word-coach-annie`);
            expect(body).toContain("DTSTART;VALUE=DATE:20300401");
            expect(body).toContain("DTEND;VALUE=DATE:20300402");
            expect(body).toContain("SUMMARY:Spring Prize — Contest Org");
            expect(unfold(body)).toContain("DESCRIPTION:Rules: https://example.com/rules\\nEntry fee: £10\\nWord limit: 2000\\nLine limit: 40\\nGenres: Literary fiction");
            expect(unfold(body)).toContain(`URL:https://localhost/opportunity/${opportunity.id}`);
            expect(body).not.toContain("VALARM");
        });

        it("omits closed opportunities and keeps the ones still open", async () => {
            await createOpportunity({ title: "Open Prize", status: "considering" });
            await createOpportunity({ title: "Done Prize", status: "closed" });

            const body = await (await fetchFeed(await readToken())).text();

            expect(body).toContain("SUMMARY:Open Prize");
            expect(body).not.toContain("Done Prize");
        });

        it("publishes an opportunity with nothing recorded beyond its deadline", async () => {
            await createOpportunity({ title: "Bare Prize" });

            const body = await (await fetchFeed(await readToken())).text();

            expect(body).toContain("SUMMARY:Bare Prize — Contest Org");
            expect(body).not.toContain("DESCRIPTION");
        });

        it("keeps the UID stable when the close date moves", async () => {
            const opportunity = await createOpportunity();
            const token = await readToken();
            const before = await (await fetchFeed(token)).text();

            await prisma.opportunity.update({
                where: { id: opportunity.id },
                data: { closeDate: new Date("2030-05-15T00:00:00.000Z") },
            });
            const after = await (await fetchFeed(token)).text();

            expect(before).toContain("DTSTART;VALUE=DATE:20300401");
            expect(after).toContain("DTSTART;VALUE=DATE:20300515");
            expect(after).toContain(`UID:opportunity-${opportunity.id}@word-coach-annie`);
        });

        it("excludes another author's opportunities", async () => {
            const other = await prisma.user.create({
                data: { id: "feed-other", email: "feed-other@test.com", googleId: "google-feed-other" },
            });
            const otherProvider = await prisma.provider.create({ data: { userId: other.id, name: "Their Org" } });
            await prisma.opportunity.create({
                data: { userId: other.id, providerId: otherProvider.id, title: "Their Prize", closeDate: CLOSE_DATE },
            });
            await createOpportunity();

            const body = await (await fetchFeed(await readToken())).text();

            expect(body).toContain("SUMMARY:Spring Prize");
            expect(body).not.toContain("Their Prize");
        });

        it("returns 404 for an unknown token and for a path missing the .ics suffix", async () => {
            const token = await readToken();

            expect((await fetchFeed("not-a-real-token.ics")).status).toBe(404);
            expect((await fetchFeed(token.replace(".ics", ""))).status).toBe(404);
        });
    });
});

/** RFC 5545 folds long lines; rejoin them before asserting on content. */
function unfold(ics: string): string {
    return ics.replace(/\r\n /g, "");
}
