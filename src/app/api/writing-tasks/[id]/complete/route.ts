import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { WritingTaskController } from "@/lib/controllers/writing-tasks";
import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const existing = await prisma.writingTask.findUnique({
            where: { id },
            select: { id: true, projectId: true },
        });

        if (!existing) {
            return NextResponse.json(
                { error: "Writing task not found" },
                { status: 404 }
            );
        }

        const userId = getCurrentUserId(request);
        const access = await verifyProjectWriteAccess(existing.projectId, userId, request.headers.get("x-user-email"));
        if (!access.authorized) return access.response;

        const task = await WritingTaskController.completeWritingTask(id);

        return NextResponse.json(task);
    } catch (error) {
        logger.error("POST /api/writing-tasks/[id]/complete error", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
