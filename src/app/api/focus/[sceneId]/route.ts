import { NextResponse } from "next/server";
import { FocusController } from "@/lib/controllers/focus";
import { logger } from "@/lib/logger";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ sceneId: string }> }
) {
    try {
        const { sceneId } = await params;
        if (!sceneId) return new NextResponse("Scene ID required", { status: 400 });


        const context = await FocusController.getSceneContext(sceneId);
        const related = await FocusController.getRelatedElements(sceneId);
        const annotations = await FocusController.getAnnotations(sceneId);

        return NextResponse.json({ context, related, annotations });
    } catch (error) {
        logger.error("Focus API error", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
