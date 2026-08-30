import { NextRequest, NextResponse } from "next/server";
import { PublicationSubmissionController } from "@/lib/controllers/submissions";
import { PublicationSubmissionCreateSchema } from "@/schemas/submissions";
import { getCurrentUserId, verifyProjectReadAccess, verifyProjectWriteAccess } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { logger } from "@/lib/logger";
import { NotFoundError } from "@/lib/errors";

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

        const result = await PublicationSubmissionController.listPublicationSubmissions(projectId);
        return NextResponse.json(result);
    } catch (error) {
        logger.error("GET /api/submissions/publications error", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch((err) => {
            logger.warn("POST /api/submissions/publications: invalid JSON body", err);
            return null;
        });
        if (body === null) {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const parsed = PublicationSubmissionCreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0].message },
                { status: 400 }
            );
        }

        const userId = getCurrentUserId(request);
        const access = await verifyProjectWriteAccess(parsed.data.projectId, userId, request.headers.get("x-user-email"));
        if (!access.authorized) return access.response;

        const submission = await PublicationSubmissionController.createPublicationSubmission({
            ...parsed.data,
            venueName: sanitizeInput(parsed.data.venueName),
            notes: parsed.data.notes ? sanitizeInput(parsed.data.notes) : undefined,
        });

        return NextResponse.json(submission, { status: 201 });
    } catch (error) {
        if (error instanceof NotFoundError) {
            return NextResponse.json({ error: error.message }, { status: 404 });
        }
        logger.error("POST /api/submissions/publications error", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
