import { NextRequest, NextResponse } from "next/server";
import { OpportunityCandidateController } from "@/lib/controllers/opportunities";
import { getCurrentUserId } from "@/lib/api-auth";
import { opportunityErrorResponse } from "../../../../errors";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ candidateId: string }> }
) {
    try {
        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { candidateId } = await params;
        const result = await OpportunityCandidateController.promoteCandidate(candidateId, userId);
        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        return opportunityErrorResponse("POST /api/opportunities/[id]/candidates/[candidateId]/promote", error);
    }
}
