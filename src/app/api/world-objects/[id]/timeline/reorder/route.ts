import { NextResponse } from "next/server";
import { UniversesController } from "@/lib/controllers/universes";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { orderedIds } = await request.json();
        if (!Array.isArray(orderedIds)) {
            throw new Error("orderedIds must be an array");
        }
        await UniversesController.reorderTimelineEntries(id, orderedIds);
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
}
