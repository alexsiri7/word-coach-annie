import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PublicationSubmissionController } from "@/lib/controllers/submissions";
import { PublicationSubmissionUpdateSchema } from "@/schemas/submissions";
import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { logger } from "@/lib/logger";

type SubmissionResolution =
    | { ok: true; id: string }
    | { ok: false; response: NextResponse };

async function resolvePublicationSubmission(
    request: NextRequest,
    params: Promise<{ id: string; submissionId: string }>
): Promise<SubmissionResolution> {
    const { id: projectId, submissionId } = await params;
    const existing = await prisma.publicationSubmission.findUnique({
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
        const resolved = await resolvePublicationSubmission(request, params);
        if (!resolved.ok) return resolved.response;
        const { id } = resolved;

        const body = await request.json().catch(() => null);
        if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

        const parsed = PublicationSubmissionUpdateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }

        if (Object.keys(parsed.data).length === 0) {
            return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        const data = { ...parsed.data };
        if (data.venueName !== undefined) data.venueName = sanitizeInput(data.venueName);

        const submission = await PublicationSubmissionController.updatePublicationSubmission(id, data);
        return NextResponse.json(submission);
    } catch (error) {
        logger.error("PATCH /api/projects/[id]/submissions/publications/[submissionId] error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; submissionId: string }> }
) {
    try {
        const resolved = await resolvePublicationSubmission(request, params);
        if (!resolved.ok) return resolved.response;
        const { id } = resolved;

        await PublicationSubmissionController.deletePublicationSubmission(id);
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("DELETE /api/projects/[id]/submissions/publications/[submissionId] error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
