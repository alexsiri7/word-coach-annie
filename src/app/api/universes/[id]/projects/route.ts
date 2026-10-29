import { NextRequest, NextResponse } from "next/server";
import { UniversesController } from "@/lib/controllers/universes";
import { getCurrentUserId, verifyUniverseAccess, verifyProjectAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { UniverseLinkProjectSchema } from "@/schemas/universes";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = getCurrentUserId(request);
        const access = await verifyUniverseAccess(id, userId);
        if (!access.authorized) return access.response;

        const body = await request.json();
        const parsed = UniverseLinkProjectSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0].message },
                { status: 400 }
            );
        }
        const { projectId } = parsed.data;

        const projectAccess = await verifyProjectAccess(projectId, userId);
        if (!projectAccess.authorized) return projectAccess.response;

        await UniversesController.linkProjectToUniverse(projectId, id);
        return NextResponse.json({ projectId, universeId: id });
    } catch (error: unknown) {
        logger.error("Route error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
