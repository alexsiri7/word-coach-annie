import { NextResponse } from "next/server";
import { UniversesController } from "@/lib/controllers/universes";

export async function GET() {
    try {
        const universes = await UniversesController.listUniverses();
        return NextResponse.json(universes);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const universe = await UniversesController.createUniverse(body);
        return NextResponse.json(universe);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
