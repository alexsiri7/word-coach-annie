import { NextRequest, NextResponse } from "next/server";
import { CalendarFeedController } from "@/lib/controllers/calendar-feed";
import { logger } from "@/lib/logger";

/** Long enough to spare the origin every poll, short enough that an edit lands the same day. */
const CACHE_CONTROL = "private, max-age=900";

function notFound(): NextResponse {
    return new NextResponse("Not found", { status: 404 });
}

/**
 * GET /api/calendar/opportunities/{token}.ics
 *
 * Public: calendar clients cannot perform an interactive login, so the unguessable
 * token in the path is the credential. An unknown token is indistinguishable from a
 * malformed one — both are a bare 404.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    try {
        const { token } = await params;
        if (!token.endsWith(".ics")) return notFound();

        const proto = request.headers.get("x-forwarded-proto") || "https";
        const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;

        const feed = await CalendarFeedController.renderOpportunityFeed(
            token.slice(0, -".ics".length),
            `${proto}://${host}`
        );
        if (feed === null) return notFound();

        return new NextResponse(feed, {
            headers: {
                "Content-Type": "text/calendar; charset=utf-8",
                "Cache-Control": CACHE_CONTROL,
            },
        });
    } catch (error) {
        logger.error("GET /api/calendar/opportunities/[token] error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
