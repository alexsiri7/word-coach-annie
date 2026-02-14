import { NextResponse } from "next/server";
import { UniversesController } from "@/lib/controllers/universes";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type") || undefined;
        const worldObjects = await UniversesController.listWorldObjects(id, type);
        return NextResponse.json(worldObjects);
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
        const worldObject = await UniversesController.createWorldObject({
            ...body,
            universeId: id,
        });
        return NextResponse.json(worldObject);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
