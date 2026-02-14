import { NextResponse } from "next/server";
import { UniversesController } from "@/lib/controllers/universes";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const worldObject = await UniversesController.getWorldObject(id);
        return NextResponse.json(worldObject.timeline);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const entry = await UniversesController.addTimelineEntry({
            ...body,
            worldObjectId: id,
        });
        return NextResponse.json(entry);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
