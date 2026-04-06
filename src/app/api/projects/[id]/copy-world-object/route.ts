import { NextRequest, NextResponse } from "next/server";
import { UniversesController } from "@/lib/controllers/universes";
import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const body = await request.json();
        const { worldObjectId } = body;

        if (!worldObjectId) {
            return NextResponse.json(
                { error: "worldObjectId is required" },
                { status: 400 }
            );
        }

        const userId = getCurrentUserId(request);
        const access = await verifyProjectWriteAccess(projectId, userId);
        if (!access.authorized) return access.response;

        const result = await UniversesController.copyWorldObjectToProject(
            worldObjectId,
            projectId
        );

        return NextResponse.json(result);
    } catch (error) {
        logger.error("Failed to copy world object to project", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        );
    }
}
