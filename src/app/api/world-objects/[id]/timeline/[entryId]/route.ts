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

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; entryId: string }> }
) {
    try {
        const { id, entryId } = await params;
        const userId = getCurrentUserId(request);
        const access = await verifyWorldObjectAccess(id, userId);
        if (!access.authorized) return access.response;

        // Verify the entry belongs to this world object (prevents IDOR)
        const owned = await prisma.worldObjectTimelineEntry.findFirst({
            where: { id: entryId, worldObjectId: id },
            select: { id: true },
        });
        if (!owned) {
            return NextResponse.json({ error: "Timeline entry not found" }, { status: 404 });
        }

        const body = await request.json();
        const entry = await UniversesController.updateTimelineEntry(entryId, body);
        return NextResponse.json(entry);
    } catch (error: unknown) {
        logger.error("Route error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; entryId: string }> }
) {
    try {
        const { id, entryId } = await params;
        const userId = getCurrentUserId(request);
        const access = await verifyWorldObjectAccess(id, userId);
        if (!access.authorized) return access.response;

        // Verify the entry belongs to this world object (prevents IDOR)
        const owned = await prisma.worldObjectTimelineEntry.findFirst({
            where: { id: entryId, worldObjectId: id },
            select: { id: true },
        });
        if (!owned) {
            return NextResponse.json({ error: "Timeline entry not found" }, { status: 404 });
        }

        await UniversesController.deleteTimelineEntry(entryId);
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        logger.error("Route error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
