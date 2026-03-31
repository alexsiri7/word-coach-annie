import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, verifyProjectAccessByNode } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { getSceneFocus } from "@/mcp/tools/coaching";

/**
 * GET /api/focus/[sceneId]
 *
 * Returns scene context, related elements, and annotations.
 * Thin wrapper around MCP tool implementation.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sceneId: string }> }
) {
    try {
        const { sceneId } = await params;
        if (!sceneId) return new NextResponse("Scene ID required", { status: 400 });

        const userId = getCurrentUserId(request);
        const access = await verifyProjectAccessByNode(sceneId, userId);
        if (!access.authorized) return access.response;

        const result = await getSceneFocus(sceneId);

        // Reshape to match the original API contract
        return NextResponse.json({
            context: result.scene,
            related: groupByType(result.relatedElements),
            annotations: result.annotations,
        });
    } catch (error) {
        logger.error("Focus API error", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

function groupByType(elements: { type: string }[]): Record<string, typeof elements> {
    const grouped: Record<string, typeof elements> = {
        CHARACTER: [],
        LOCATION: [],
        PLOTLINE: [],
        WORLD_ELEMENT: [],
        NOTE: [],
    };
    for (const el of elements) {
        if (grouped[el.type]) grouped[el.type].push(el);
    }
    return grouped;
}
