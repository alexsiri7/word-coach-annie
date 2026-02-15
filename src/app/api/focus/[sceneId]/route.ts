import { NextResponse } from "next/server";
import { FocusController } from "@/lib/controllers/focus";

export async function GET(
    request: Request,
    { params }: { params: { sceneId: string } }
) {
    try {
        const sceneId = params.sceneId;
        if (!sceneId) return new NextResponse("Scene ID required", { status: 400 });

        const context = await FocusController.getSceneContext(sceneId);
        const related = await FocusController.getRelatedElements(sceneId);

        return NextResponse.json({ context, related });
    } catch (error) {
        console.error("Focus API Error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
