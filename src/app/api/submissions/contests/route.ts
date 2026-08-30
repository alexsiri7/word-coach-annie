import { NextRequest, NextResponse } from "next/server";
import { ContestSubmissionController } from "@/lib/controllers/submissions";
import { ContestSubmissionCreateSchema } from "@/schemas/submissions";
import { getCurrentUserId, verifyProjectReadAccess, verifyProjectWriteAccess } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { logger } from "@/lib/logger";

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

        const result = await ContestSubmissionController.listContestSubmissions(projectId);
        return NextResponse.json(result);
    } catch (error) {
        logger.error("GET /api/submissions/contests error", error);
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

        const parsed = ContestSubmissionCreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0].message },
                { status: 400 }
            );
        }

        const userId = getCurrentUserId(request);
        const access = await verifyProjectWriteAccess(parsed.data.projectId, userId, request.headers.get("x-user-email"));
        if (!access.authorized) return access.response;

        const submission = await ContestSubmissionController.createContestSubmission({
            ...parsed.data,
            contestName: sanitizeInput(parsed.data.contestName),
            notes: parsed.data.notes ? sanitizeInput(parsed.data.notes) : undefined,
        });

        return NextResponse.json(submission, { status: 201 });
    } catch (error) {
        logger.error("POST /api/submissions/contests error", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
