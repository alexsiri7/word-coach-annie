import { NextRequest, NextResponse } from "next/server";
import { ContestSubmissionController, ForbiddenError, NotFoundError } from "@/lib/controllers/submissions";
import { ContestSubmissionCreateSchema } from "@/schemas/submissions";
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

        const result = await ContestSubmissionController.listContestSubmissions({ projectId });
        return NextResponse.json(result);
    } catch (error) {
        logger.error("GET /api/projects/[id]/submissions/contests error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: projectId } = await params;

        // Auth first — matches project convention
        const userId = getCurrentUserId(request);
        const access = await verifyProjectWriteAccess(projectId, userId, request.headers.get("x-user-email"));
        if (!access.authorized) return access.response;

        const body = await request.json().catch((e: unknown) => {
            logger.warn("Invalid JSON body received", { path: request.url, error: e instanceof Error ? e.message : String(e) });
            return null;
        });
        if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

        const parsed = ContestSubmissionCreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }

        const submission = await ContestSubmissionController.createContestSubmission({
            projectId,
            providerId: parsed.data.providerId,
            contestName: sanitizeInput(parsed.data.contestName),
            submissionDate: parsed.data.submissionDate,
            reviewDate: parsed.data.reviewDate,
            submissionUrl: parsed.data.submissionUrl ? sanitizeInput(parsed.data.submissionUrl) : undefined,
            status: parsed.data.status,
        });

        return NextResponse.json(submission, { status: 201 });
    } catch (error) {
        if (error instanceof NotFoundError) {
            return NextResponse.json({ error: error.message }, { status: 404 });
        }
        if (error instanceof ForbiddenError) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        logger.error("POST /api/projects/[id]/submissions/contests error", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
