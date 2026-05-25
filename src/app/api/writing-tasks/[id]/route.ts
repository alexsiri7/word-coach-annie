import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { WritingTaskController } from "@/lib/controllers/writing-tasks";
import { WritingTaskUpdateSchema } from "@/schemas/writing-tasks";
import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { logger } from "@/lib/logger";

export async function PATCH(
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

        const body = await request.json().catch(() => null);
        if (body === null) {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const parsed = WritingTaskUpdateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0].message },
                { status: 400 }
            );
        }

        if (Object.keys(parsed.data).length === 0) {
            return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        const task = await WritingTaskController.updateWritingTask(id, {
            ...parsed.data,
            ...(parsed.data.name !== undefined && { name: sanitizeInput(parsed.data.name) }),
            ...(parsed.data.whatIsNeeded !== undefined && { whatIsNeeded: sanitizeInput(parsed.data.whatIsNeeded) }),
        });

        return NextResponse.json(task);
    } catch (error) {
        logger.error("PATCH /api/writing-tasks/[id] error", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function DELETE(
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

        await WritingTaskController.deleteWritingTask(id);

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("DELETE /api/writing-tasks/[id] error", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
