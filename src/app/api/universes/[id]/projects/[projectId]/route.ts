import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { UniversesController } from "@/lib/controllers/universes";
import { getCurrentUserId, verifyUniverseAccess, verifyProjectAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; projectId: string }> }
) {
    try {
        const { id, projectId } = await params;
        const userId = getCurrentUserId(request);
        const access = await verifyUniverseAccess(id, userId);
        if (!access.authorized) return access.response;

        const projectAccess = await verifyProjectAccess(projectId, userId);
        if (!projectAccess.authorized) return projectAccess.response;

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { universeId: true },
        });
        if (!project || project.universeId !== id) {
            return NextResponse.json(
                { error: "Project is not linked to this universe" },
                { status: 404 }
            );
        }

        await UniversesController.unlinkProjectFromUniverse(projectId);
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        logger.error("Route error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
