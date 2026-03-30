import { NextResponse } from "next/server";
import { UniversesController } from "@/lib/controllers/universes";
import { logger } from "@/lib/logger";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string; entryId: string }> }
) {
    try {
        const { entryId } = await params;
        const body = await request.json();
        const entry = await UniversesController.updateTimelineEntry(entryId, body);
        return NextResponse.json(entry);
    } catch (error: unknown) {
        logger.error("Route error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string; entryId: string }> }
) {
    try {
        const { entryId } = await params;
        await UniversesController.deleteTimelineEntry(entryId);
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        logger.error("Route error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
