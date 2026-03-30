import { NextResponse } from "next/server";
import { UniversesController } from "@/lib/controllers/universes";
import { logger } from "@/lib/logger";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { orderedIds } = await request.json();
        if (!Array.isArray(orderedIds)) {
            return NextResponse.json(
                { error: "orderedIds must be an array" },
                { status: 400 }
            );
        }
        await UniversesController.reorderTimelineEntries(id, orderedIds);
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        logger.error("POST /api/world-objects/[id]/timeline/reorder error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
