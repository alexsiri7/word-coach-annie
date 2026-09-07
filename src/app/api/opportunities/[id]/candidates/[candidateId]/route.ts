import { NextRequest, NextResponse } from "next/server";
import { OpportunityCandidateController } from "@/lib/controllers/opportunities";
import { CandidateUpdateSchema } from "@/schemas/opportunities";
import { getCurrentUserId } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { opportunityErrorResponse } from "../../../errors";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ candidateId: string }> }
) {
    try {
        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json().catch(() => null);
        if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

        const parsed = CandidateUpdateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }
        if (Object.keys(parsed.data).length === 0) {
            return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        const { candidateId } = await params;
        const candidate = await OpportunityCandidateController.updateCandidate(candidateId, userId, {
            ...parsed.data,
            notes: typeof parsed.data.notes === "string" ? sanitizeInput(parsed.data.notes) : parsed.data.notes,
        });

        return NextResponse.json(candidate);
    } catch (error) {
        return opportunityErrorResponse("PATCH /api/opportunities/[id]/candidates/[candidateId]", error);
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ candidateId: string }> }
) {
    try {
        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { candidateId } = await params;
        const result = await OpportunityCandidateController.deleteCandidate(candidateId, userId);
        return NextResponse.json(result);
    } catch (error) {
        return opportunityErrorResponse("DELETE /api/opportunities/[id]/candidates/[candidateId]", error);
    }
}
