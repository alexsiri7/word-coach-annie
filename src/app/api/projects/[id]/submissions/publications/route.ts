import { NextRequest, NextResponse } from "next/server";
import { PublicationSubmissionController } from "@/lib/controllers/submissions";
import { PublicationSubmissionCreateSchema } from "@/schemas/submissions";
import { getCurrentUserId, verifyProjectReadAccess, verifyProjectWriteAccess } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { logger } from "@/lib/logger";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;
        const userId = getCurrentUserId(request);
        const access = await verifyProjectReadAccess(projectId, userId, request.headers.get("x-user-email"));
        if (!access.authorized) return access.response;

        const result = await PublicationSubmissionController.listPublicationSubmissions({ projectId });
        return NextResponse.json(result);
    } catch (error) {
        logger.error("GET /api/projects/[id]/submissions/publications error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;

        const body = await request.json().catch(() => null);
        if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

        const parsed = PublicationSubmissionCreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }

        const userId = getCurrentUserId(request);
        const access = await verifyProjectWriteAccess(projectId, userId, request.headers.get("x-user-email"));
        if (!access.authorized) return access.response;

        const submission = await PublicationSubmissionController.createPublicationSubmission({
            projectId,
            venueName: sanitizeInput(parsed.data.venueName),
            submissionDate: parsed.data.submissionDate,
            status: parsed.data.status,
        });

        return NextResponse.json(submission, { status: 201 });
    } catch (error) {
        logger.error("POST /api/projects/[id]/submissions/publications error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
