import { NextRequest, NextResponse } from "next/server";
import { OpportunityCandidateController } from "@/lib/controllers/opportunities";
import { CandidateCreateSchema } from "@/schemas/opportunities";
import { getCurrentUserId } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { opportunityErrorResponse } from "../../errors";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        const result = await OpportunityCandidateController.listCandidates(id, userId);
        return NextResponse.json(result);
    } catch (error) {
        return opportunityErrorResponse("GET /api/opportunities/[id]/candidates", error);
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json().catch(() => null);
        if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

        const parsed = CandidateCreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }

        const { id } = await params;
        const candidate = await OpportunityCandidateController.createCandidate({
            ...parsed.data,
            opportunityId: id,
            userId,
            notes: parsed.data.notes ? sanitizeInput(parsed.data.notes) : undefined,
        });

        return NextResponse.json(candidate, { status: 201 });
    } catch (error) {
        return opportunityErrorResponse("POST /api/opportunities/[id]/candidates", error);
    }
}
