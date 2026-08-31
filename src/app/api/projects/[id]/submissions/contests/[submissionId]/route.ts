import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ContestSubmissionController, ForbiddenError, NotFoundError } from "@/lib/controllers/submissions";
import { ContestSubmissionUpdateSchema } from "@/schemas/submissions";
import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { logger } from "@/lib/logger";

type SubmissionResolution =
    | { ok: true; id: string }
    | { ok: false; response: NextResponse };

async function resolveContestSubmission(
    request: NextRequest,
    params: Promise<{ id: string; submissionId: string }>
): Promise<SubmissionResolution> {
    const { id: projectId, submissionId } = await params;
    const existing = await prisma.contestSubmission.findUnique({
        where: { id: submissionId },
        select: { id: true, projectId: true },
    });
    if (!existing || existing.projectId !== projectId) {
        return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
    }
    const userId = getCurrentUserId(request);
    const access = await verifyProjectWriteAccess(existing.projectId, userId, request.headers.get("x-user-email"));
    if (!access.authorized) return { ok: false, response: access.response };
    return { ok: true, id: submissionId };
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; submissionId: string }> }
) {
    try {
        const resolved = await resolveContestSubmission(request, params);
        if (!resolved.ok) return resolved.response;
        const { id } = resolved;

        const body = await request.json().catch((e: unknown) => {
            logger.warn("Invalid JSON body received", { path: request.url, error: e instanceof Error ? e.message : String(e) });
            return null;
        });
        if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

        const parsed = ContestSubmissionUpdateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }

        if (Object.keys(parsed.data).length === 0) {
            return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        const data = { ...parsed.data };
        if (data.contestName !== undefined) data.contestName = sanitizeInput(data.contestName);
        if (data.submissionUrl !== undefined) data.submissionUrl = sanitizeInput(data.submissionUrl);

        const submission = await ContestSubmissionController.updateContestSubmission(id, data);
        return NextResponse.json(submission);
    } catch (error) {
        if (error instanceof NotFoundError) {
            return NextResponse.json({ error: error.message }, { status: 404 });
        }
        if (error instanceof ForbiddenError) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        logger.error("PATCH /api/projects/[id]/submissions/contests/[submissionId] error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; submissionId: string }> }
) {
    try {
        const resolved = await resolveContestSubmission(request, params);
        if (!resolved.ok) return resolved.response;
        const { id } = resolved;

        await ContestSubmissionController.deleteContestSubmission(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("DELETE /api/projects/[id]/submissions/contests/[submissionId] error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
