import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { UniversesController } from "@/lib/controllers/universes";
import { getCurrentUserId, verifyUniverseAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

async function verifyWorldObjectAccess(worldObjectId: string, userId: string | null) {
    const wo = await prisma.worldObject.findUnique({
        where: { id: worldObjectId },
        select: { universeId: true },
    });
    if (!wo) {
        return { authorized: false as const, response: NextResponse.json({ error: "World object not found" }, { status: 404 }) };
    }
    return verifyUniverseAccess(wo.universeId, userId);
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const userId = getCurrentUserId(request);
        const access = await verifyWorldObjectAccess(id, userId);
        if (!access.authorized) return access.response;

        const { orderedIds } = await request.json();
        if (!Array.isArray(orderedIds)) {
            return NextResponse.json(
                { error: "orderedIds must be an array" },
                { status: 400 }
            );
        }

        // Verify all IDs belong to this world object before reordering
        if (orderedIds.length > 0) {
            const uniqueIds = new Set(orderedIds);
            if (uniqueIds.size !== orderedIds.length) {
                return NextResponse.json(
                    { error: "orderedIds contains duplicate entries" },
                    { status: 400 }
                );
            }
            const owned = await prisma.worldObjectTimelineEntry.findMany({
                where: { id: { in: orderedIds }, worldObjectId: id },
                select: { id: true },
            });
            if (owned.length !== orderedIds.length) {
                return NextResponse.json(
                    { error: "Some timeline entries do not belong to this world object" },
                    { status: 400 }
                );
            }
        }

        await UniversesController.reorderTimelineEntries(id, orderedIds);
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        logger.error("POST /api/world-objects/[id]/timeline/reorder error", { error, worldObjectId: id });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
