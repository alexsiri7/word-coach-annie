import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { UniversesController } from "@/lib/controllers/universes";
import { getCurrentUserId, verifyProjectWriteAccess, verifyUniverseAccess } from "@/lib/api-auth";
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

        // Verify user owns the source world object's universe
        const worldObject = await prisma.worldObject.findUnique({
            where: { id: worldObjectId },
            select: { universeId: true },
        });
        if (!worldObject) {
            return NextResponse.json({ error: "World object not found" }, { status: 404 });
        }
        const sourceAccess = await verifyUniverseAccess(worldObject.universeId, userId);
        if (!sourceAccess.authorized) return sourceAccess.response;

        const result = await UniversesController.copyWorldObjectToProject(
            worldObjectId,
            projectId
        );

        return NextResponse.json(result);
    } catch (error) {
        logger.error("Failed to copy world object to project", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
