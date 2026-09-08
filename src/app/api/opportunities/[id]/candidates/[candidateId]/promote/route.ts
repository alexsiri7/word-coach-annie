import { NextRequest, NextResponse } from "next/server";
import { OpportunityCandidateController } from "@/lib/controllers/opportunities";
import { getCurrentUserId } from "@/lib/api-auth";
import { isGoogleAuthMode } from "@/lib/auth";
import { opportunityErrorResponse } from "../../../../errors";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; candidateId: string }> }
) {
    try {
        const userId = getCurrentUserId(request);
        if (isGoogleAuthMode() && !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id, candidateId } = await params;
        const result = await OpportunityCandidateController.promoteCandidate(candidateId, userId, id);
        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        return opportunityErrorResponse("POST /api/opportunities/[id]/candidates/[candidateId]/promote", error);
    }
}
