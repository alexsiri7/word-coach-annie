import { NextRequest, NextResponse } from "next/server";
import { UniversesController } from "@/lib/controllers/universes";
import { getCurrentUserId, verifyUniverseAccess } from "@/lib/api-auth";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = getCurrentUserId(request);
        const access = await verifyUniverseAccess(id, userId);
        if (!access.authorized) return access.response;

        const universe = await UniversesController.getUniverse(id);
        return NextResponse.json(universe);
    } catch (error: unknown) {
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = getCurrentUserId(request);
        const access = await verifyUniverseAccess(id, userId);
        if (!access.authorized) return access.response;

        const body = await request.json();
        const universe = await UniversesController.updateUniverse(id, body);
        return NextResponse.json(universe);
    } catch (error: unknown) {
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = getCurrentUserId(request);
        const access = await verifyUniverseAccess(id, userId);
        if (!access.authorized) return access.response;

        await UniversesController.deleteUniverse(id);
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}
