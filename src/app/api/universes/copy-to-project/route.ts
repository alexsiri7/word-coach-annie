import { NextRequest, NextResponse } from "next/server";
import { UniversesController } from "@/lib/controllers/universes";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { worldObjectId, projectId } = body;

        if (!worldObjectId || !projectId) {
            return NextResponse.json(
                { error: "worldObjectId and projectId are required" },
                { status: 400 }
            );
        }

        // Verify user has access to the target project
        const userId = getCurrentUserId(request);
        const access = await verifyProjectAccess(projectId, userId);
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
