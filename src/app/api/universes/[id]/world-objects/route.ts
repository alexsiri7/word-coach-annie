import { NextRequest, NextResponse } from "next/server";
import { UniversesController } from "@/lib/controllers/universes";
import { getCurrentUserId, verifyUniverseAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { WorldObjectCreateSchema } from "@/schemas/world-objects";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = getCurrentUserId(request);
        const access = await verifyUniverseAccess(id, userId);
        if (!access.authorized) return access.response;

        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type") || undefined;
        const worldObjects = await UniversesController.listWorldObjects(id, type);
        return NextResponse.json(worldObjects);
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
        const access = await verifyUniverseAccess(id, userId);
        if (!access.authorized) return access.response;

        const body = await request.json();
        const parsed = WorldObjectCreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.errors[0].message },
                { status: 400 }
            );
        }
        const worldObject = await UniversesController.createWorldObject({
            ...parsed.data,
            universeId: id,
        });
        return NextResponse.json(worldObject);
    } catch (error: unknown) {
        logger.error("Route error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
