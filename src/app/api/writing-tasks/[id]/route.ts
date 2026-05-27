import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { WritingTaskController } from "@/lib/controllers/writing-tasks";
import { WritingTaskUpdateSchema } from "@/schemas/writing-tasks";
import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { logger } from "@/lib/logger";

type TaskResolution =
    | { ok: true; id: string }
    | { ok: false; response: NextResponse };

async function resolveTask(request: NextRequest, params: Promise<{ id: string }>): Promise<TaskResolution> {
    const { id } = await params;
    const existing = await prisma.writingTask.findUnique({
        where: { id },
        select: { id: true, projectId: true },
    });
    if (!existing) {
        return { ok: false, response: NextResponse.json({ error: "Writing task not found" }, { status: 404 }) };
    }
    const userId = getCurrentUserId(request);
    const access = await verifyProjectWriteAccess(existing.projectId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return { ok: false, response: access.response };
    return { ok: true, id };
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolved = await resolveTask(request, params);
        if (!resolved.ok) return resolved.response;
        const { id } = resolved;

        const body = await request.json().catch((err) => {
            logger.warn("PATCH /api/writing-tasks/[id]: invalid JSON body", err);
            return null;
        });
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

        const data = { ...parsed.data };
        if (data.name !== undefined) data.name = sanitizeInput(data.name);
        if (data.whatIsNeeded !== undefined) data.whatIsNeeded = sanitizeInput(data.whatIsNeeded);
        const task = await WritingTaskController.updateWritingTask(id, data);

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
        const resolved = await resolveTask(request, params);
        if (!resolved.ok) return resolved.response;
        const { id } = resolved;

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
