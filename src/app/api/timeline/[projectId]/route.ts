import { TimelineController } from "@/lib/controllers/timeline";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, verifyProjectReadAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;

        const userId = getCurrentUserId(request);
        const access = await verifyProjectReadAccess(projectId, userId, request.headers.get("x-user-email"));
        if (!access.authorized) return access.response;

        const data = await TimelineController.getTimelineData(projectId);
        return NextResponse.json(data);
    } catch (error) {
        logger.error("Timeline data fetch error", error);
        return NextResponse.json(
            { error: "Failed to fetch timeline data" },
            { status: 500 }
        );
    }
}
