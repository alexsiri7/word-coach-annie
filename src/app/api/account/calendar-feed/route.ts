import { NextRequest, NextResponse } from "next/server";
import { CalendarFeedController, feedPath } from "@/lib/controllers/calendar-feed";
import { getCurrentUserId, validateCsrfHeader } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

/** The caller joins this with its own origin — the browser knows the public one. */
export async function GET(request: NextRequest) {
    try {
        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const token = await CalendarFeedController.getOrCreateToken(userId);
        return NextResponse.json({ feedPath: feedPath(token) });
    } catch (error) {
        logger.error("GET /api/account/calendar-feed error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

/** Mints a new token, which invalidates any calendar still subscribed to the old URL. */
export async function POST(request: NextRequest) {
    const csrfError = validateCsrfHeader(request);
    if (csrfError) return csrfError;
    try {
        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const token = await CalendarFeedController.regenerateToken(userId);
        return NextResponse.json({ feedPath: feedPath(token) });
    } catch (error) {
        logger.error("POST /api/account/calendar-feed error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
