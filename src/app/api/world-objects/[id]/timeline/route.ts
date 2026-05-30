import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { UniversesController } from "@/lib/controllers/universes";
import { getCurrentUserId, verifyUniverseAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { TimelineEntryCreateSchema } from "@/schemas/timeline";

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

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = getCurrentUserId(request);
        const access = await verifyWorldObjectAccess(id, userId);
        if (!access.authorized) return access.response;

        const worldObject = await UniversesController.getWorldObject(id);
        return NextResponse.json(worldObject.timeline);
    } catch (error: unknown) {
        logger.error("Route error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = getCurrentUserId(request);
        const access = await verifyWorldObjectAccess(id, userId);
        if (!access.authorized) return access.response;

        const body = await request.json();
        const parsed = TimelineEntryCreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0].message },
                { status: 400 }
            );
        }
        const entry = await UniversesController.addTimelineEntry({
            ...parsed.data,
            worldObjectId: id,
        });
        return NextResponse.json(entry);
    } catch (error: unknown) {
        logger.error("Route error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
