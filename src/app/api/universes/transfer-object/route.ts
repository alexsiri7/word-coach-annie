import { NextRequest, NextResponse } from "next/server";
import { UniversesController } from "@/lib/controllers/universes";
import { getCurrentUserId, verifyUniverseAccess } from "@/lib/api-auth";
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

        const result = await UniversesController.transferStoryObjectToUniverse(
            storyObjectId,
            universeId
        );

        return NextResponse.json(result);
    } catch (error) {
        logger.error("Failed to transfer story object", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        );
    }
}
