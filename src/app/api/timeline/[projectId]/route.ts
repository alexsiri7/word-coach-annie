import { TimelineController } from "@/lib/controllers/timeline";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
    request: NextRequest,
    { params }: { params: { projectId: string } }
) {
    try {
        const projectId = params.projectId;
        const data = await TimelineController.getTimelineData(projectId);
        return NextResponse.json(data);
    } catch (error) {
        console.error("Timeline data fetch error:", error);
        return NextResponse.json(
            { error: "Failed to fetch timeline data" },
            { status: 500 }
        );
    }
}
