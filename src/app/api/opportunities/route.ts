import { NextRequest, NextResponse } from "next/server";
import { OpportunityController } from "@/lib/controllers/opportunities";
import { OpportunityCreateSchema, OpportunityStatus } from "@/schemas/opportunities";
import { getCurrentUserId } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { opportunityErrorResponse } from "./errors";

export async function GET(request: NextRequest) {
    try {
        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const params = request.nextUrl.searchParams;
        const status = params.get("status");
        const parsedStatus = status === null ? undefined : OpportunityStatus.safeParse(status);
        if (parsedStatus && !parsedStatus.success) {
            return NextResponse.json({ error: parsedStatus.error.issues[0].message }, { status: 400 });
        }

        const filters = {
            status: parsedStatus?.data,
            providerId: params.get("providerId") ?? undefined,
            projectId: params.get("projectId") ?? undefined,
        };
        // The contests list is both halves: the opportunities, and the entries that never had
        // one. Only this page wants the union — listOpportunities stays what MCP and the
        // publishing hub read.
        const [{ opportunities }, { submissions }] = await Promise.all([
            OpportunityController.listOpportunities(userId, filters),
            OpportunityController.listSubmissionsWithoutOpportunity(userId, filters),
        ]);
        return NextResponse.json({
            opportunities,
            unlinkedSubmissions: submissions,
            total: opportunities.length + submissions.length,
        });
    } catch (error) {
        return opportunityErrorResponse("GET /api/opportunities", error);
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => null);
        if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

        const parsed = OpportunityCreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }

        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const opportunity = await OpportunityController.createOpportunity({
            ...parsed.data,
            userId,
            title: sanitizeInput(parsed.data.title),
            rulesUrl: parsed.data.rulesUrl ? sanitizeInput(parsed.data.rulesUrl) : undefined,
            entryFee: parsed.data.entryFee ? sanitizeInput(parsed.data.entryFee) : undefined,
            genreRestrictions: parsed.data.genreRestrictions
                ? sanitizeInput(parsed.data.genreRestrictions)
                : undefined,
            eligibilityNotes: parsed.data.eligibilityNotes
                ? sanitizeInput(parsed.data.eligibilityNotes)
                : undefined,
        });

        return NextResponse.json(opportunity, { status: 201 });
    } catch (error) {
        return opportunityErrorResponse("POST /api/opportunities", error);
    }
}
