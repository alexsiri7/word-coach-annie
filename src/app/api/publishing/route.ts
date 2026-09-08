import { NextRequest, NextResponse } from "next/server";
import { PublishingController } from "@/lib/controllers/publishing";
import { OpportunityController } from "@/lib/controllers/opportunities";
import { getCurrentUserId } from "@/lib/api-auth";
import { isGoogleAuthMode } from "@/lib/auth";
import { logger } from "@/lib/logger";

// GET /api/publishing - the two halves of the hub: where each story sits, and what is open
export async function GET(request: NextRequest) {
    try {
        const userId = getCurrentUserId(request);
        if (isGoogleAuthMode() && !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const [{ stories }, { opportunities }] = await Promise.all([
            PublishingController.listStories(userId),
            OpportunityController.listOpportunities(userId),
        ]);

        return NextResponse.json({ stories, opportunities });
    } catch (error) {
        logger.error("GET /api/publishing error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
