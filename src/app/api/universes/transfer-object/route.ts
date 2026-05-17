import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { UniversesController } from "@/lib/controllers/universes";
import { getCurrentUserId, verifyUniverseAccess, verifyProjectAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { storyObjectId, universeId } = body;

        if (!storyObjectId || !universeId) {
            return NextResponse.json(
                { error: "storyObjectId and universeId are required" },
                { status: 400 }
            );
        }

        // Verify user has access to the target universe
        const userId = getCurrentUserId(request);
        const access = await verifyUniverseAccess(universeId, userId);
        if (!access.authorized) return access.response;

        // Verify user owns the source story object's project
        const storyObject = await prisma.storyObject.findUnique({
            where: { id: storyObjectId },
            select: { projectId: true },
        });
        if (!storyObject) {
            return NextResponse.json({ error: "Story object not found" }, { status: 404 });
        }
        const sourceAccess = await verifyProjectAccess(storyObject.projectId, userId);
        if (!sourceAccess.authorized) return sourceAccess.response;

        const result = await UniversesController.transferStoryObjectToUniverse(
            storyObjectId,
            universeId
        );

        return NextResponse.json(result);
    } catch (error) {
        logger.error("Failed to transfer story object", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
