import { NextRequest, NextResponse } from "next/server";
import { WritingTaskController } from "@/lib/controllers/writing-tasks";
import { WritingTaskCreateSchema } from "@/schemas/writing-tasks";
import { getCurrentUserId, verifyProjectReadAccess, verifyProjectWriteAccess } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const projectId = searchParams.get("projectId");

        if (!projectId) {
            return NextResponse.json(
                { error: "projectId is required" },
                { status: 400 }
            );
        }

        const userId = getCurrentUserId(request);
        const access = await verifyProjectReadAccess(projectId, userId, request.headers.get("x-user-email"));
        if (!access.authorized) return access.response;

        const projectExists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
        if (!projectExists) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        const importance = searchParams.get("importance");
        const size = searchParams.get("size");
        const energy = searchParams.get("energy");
        const completed = searchParams.get("completed");

        const result = await WritingTaskController.listWritingTasks({
            projectId,
            ...(importance && { importance }),
            ...(size && { size }),
            ...(energy && { energy }),
            ...(completed !== null && { completed: completed === "true" }),
        });

        return NextResponse.json(result);
    } catch (error) {
        logger.error("GET /api/writing-tasks error", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => null);
        if (body === null) {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const parsed = WritingTaskCreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0].message },
                { status: 400 }
            );
        }

        const userId = getCurrentUserId(request);
        const access = await verifyProjectWriteAccess(parsed.data.projectId, userId, request.headers.get("x-user-email"));
        if (!access.authorized) return access.response;

        const projectExists = await prisma.project.findUnique({ where: { id: parsed.data.projectId }, select: { id: true } });
        if (!projectExists) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        const task = await WritingTaskController.createWritingTask({
            ...parsed.data,
            name: sanitizeInput(parsed.data.name),
            whatIsNeeded: parsed.data.whatIsNeeded ? sanitizeInput(parsed.data.whatIsNeeded) : undefined,
        });

        return NextResponse.json(task, { status: 201 });
    } catch (error) {
        logger.error("POST /api/writing-tasks error", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
