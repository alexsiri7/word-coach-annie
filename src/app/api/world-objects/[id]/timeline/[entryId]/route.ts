import { NextResponse } from "next/server";
import { UniversesController } from "@/lib/controllers/universes";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string; entryId: string }> }
) {
    try {
        const { entryId } = await params;
        const body = await request.json();
        const entry = await UniversesController.updateTimelineEntry(entryId, body);
        return NextResponse.json(entry);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
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
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
